/**
 * Family alert relay — the only state this server keeps.
 *
 * Privacy by construction: an alert is { band, category, source, app? } plus ids
 * and a timestamp. There is no field that could carry message text, audio,
 * transcripts, phone numbers or codes. Alerts expire after 24 h (max 200 per family).
 *
 * DaCy Kids: the guardian chooses which apps the child's device may screen
 * (`childSettings`); the child device reads them from the alert poll. Only a
 * guardian can change them, and only the family creator is a guardian: joining
 * with a code always makes a protected member.
 *
 * Alert visibility: guardians see every alert in the family; a protected member
 * sees only the alerts its own device sent (a sibling or grandparent never sees a
 * child's safety alerts).
 *
 * Each member gets their own random secret (sent as `x-family-secret`); only a
 * SHA-256 hash of it is kept in memory and on disk, and comparisons are constant-time.
 * Leaving a family revokes that member's secret.
 *
 * Persistence: server/data/family.json (or $DACY_DATA_DIR/family.json), written
 * atomically and debounced.
 */
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDataDir } from './config.js';
import {
  MONITORED_APP_IDS,
  type AlertSourceKind,
  type ChildSafetySettings,
  type FamilyAlert,
  type FamilyMember,
  type FamilyRole,
  type IndicatorType,
  type MonitoredAppId,
  type UpdateChildSettingsRequest,
} from './contract.js';
import { ApiError } from './errors.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const CODE_LENGTH = 6;
const MAX_MEMBERS = 12;
const MAX_ALERTS = 200;
const ALERT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIST_LIMIT = 50;
const WRITE_DEBOUNCE_MS = 400;

interface StoredMember extends FamilyMember {
  /** hex SHA-256 of the member's secret */
  secretHash: string;
}

interface StoredFamily {
  familyId: string;
  code: string;
  createdAt: string;
  members: StoredMember[];
  alerts: FamilyAlert[];
  /** scrypt(leave PIN) — protected members must present the PIN to leave. */
  leavePinHash?: string;
  leavePinSalt?: string;
  /** Wrong-PIN counter and lockout, so a child cannot brute-force a short PIN. */
  pinFailures?: number;
  pinLockedUntil?: string;
  /** DaCy Kids: apps the guardian allows the child's device to screen. Unset until first saved. */
  childSettings?: ChildSafetySettings;
}

export const LEAVE_PIN_MAX_ATTEMPTS = 5;
export const LEAVE_PIN_LOCK_MS = 15 * 60 * 1000;

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 32).toString('hex');
}

interface StoreFile {
  version: 1;
  families: StoredFamily[];
}

/* ---------------- helpers ---------------- */

function hashSecret(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}

function newSecret(): string {
  return randomBytes(32).toString('hex');
}

function publicMember(m: StoredMember): FamilyMember {
  return { memberId: m.memberId, displayName: m.displayName, role: m.role, joinedAt: m.joinedAt };
}

/** De-duplicates and returns the apps in the canonical MONITORED_APP_IDS order (unknown ids dropped). */
export function normalizeMonitoredApps(apps: readonly string[]): MonitoredAppId[] {
  return MONITORED_APP_IDS.filter((id) => apps.includes(id));
}

function isMonitoredApp(value: unknown): value is MonitoredAppId {
  return typeof value === 'string' && (MONITORED_APP_IDS as readonly string[]).includes(value);
}

/** Validates child settings read back from disk; returns undefined when unusable. */
function sanitizeChildSettings(raw: unknown): ChildSafetySettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<Record<keyof ChildSafetySettings, unknown>>;
  if (typeof r.enabled !== 'boolean' || typeof r.childWarnings !== 'boolean' || !Array.isArray(r.monitoredApps)) {
    return undefined;
  }
  const updatedAt = typeof r.updatedAt === 'string' && Number.isFinite(Date.parse(r.updatedAt)) ? r.updatedAt : new Date(0).toISOString();
  return {
    enabled: r.enabled,
    monitoredApps: normalizeMonitoredApps(r.monitoredApps.filter((a): a is string => typeof a === 'string')),
    childWarnings: r.childWarnings,
    updatedAt,
  };
}

function copyChildSettings(settings: ChildSafetySettings): ChildSafetySettings {
  return { ...settings, monitoredApps: [...settings.monitoredApps] };
}

/** Upper-cases and strips spaces/dashes so "abc-234" and "ABC 234" both work. */
export function normalizeJoinCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]+/g, '');
}

/* ---------------- store ---------------- */

export class FamilyStore {
  private readonly families = new Map<string, StoredFamily>();
  private readonly byCode = new Map<string, string>();
  private writeTimer: NodeJS.Timeout | null = null;
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'family.json');
    this.load();
  }

  private load(): void {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, 'utf8');
    } catch {
      return; // first run
    }
    try {
      const parsed = JSON.parse(raw) as Partial<StoreFile>;
      for (const family of parsed.families ?? []) {
        if (!family?.familyId || !family.code || !Array.isArray(family.members)) continue;
        family.alerts = Array.isArray(family.alerts) ? family.alerts : [];
        const childSettings = sanitizeChildSettings(family.childSettings);
        if (childSettings) family.childSettings = childSettings;
        else delete family.childSettings;
        this.families.set(family.familyId, family);
        this.byCode.set(family.code, family.familyId);
      }
      for (const family of this.families.values()) this.prune(family);
    } catch {
      console.warn('[family] could not parse family.json — starting with an empty relay');
    }
  }

  private scheduleWrite(): void {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.writeNow();
    }, WRITE_DEBOUNCE_MS);
    this.writeTimer.unref();
  }

  private writeNow(): void {
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true });
      const data: StoreFile = { version: 1, families: [...this.families.values()] };
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
      renameSync(tmp, this.filePath);
    } catch (err) {
      console.warn(`[family] write failed: ${err instanceof Error ? err.name : 'error'}`);
    }
  }

  /** Writes pending changes synchronously (tests, shutdown). */
  flush(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
      this.writeNow();
    }
  }

  private uniqueCode(): string {
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.byCode.has(code)) return code;
    }
    throw new ApiError('INTERNAL', 'Could not allocate a join code');
  }

  private prune(family: StoredFamily): void {
    const cutoff = Date.now() - ALERT_TTL_MS;
    family.alerts = family.alerts.filter((a) => Date.parse(a.createdAt) >= cutoff).slice(-MAX_ALERTS);
  }

  /** Returns the member owning `secret`, or throws 401. Constant-time per member. */
  authenticate(familyId: string, secret: string | undefined): { family: StoredFamily; member: StoredMember } {
    const family = this.families.get(familyId);
    if (!secret || !family) {
      // Same answer for unknown family and bad secret: don't leak which families exist.
      throw new ApiError('UNAUTHORIZED', 'Missing or invalid x-family-secret');
    }
    const provided = hashSecret(secret);
    let match: StoredMember | null = null;
    for (const member of family.members) {
      const stored = Buffer.from(member.secretHash, 'hex');
      if (stored.length === provided.length && timingSafeEqual(stored, provided) && !match) {
        match = member;
      }
    }
    if (!match) throw new ApiError('UNAUTHORIZED', 'Missing or invalid x-family-secret');
    return { family, member: match };
  }

  create(displayName: string, leavePin: string): {
    familyId: string;
    memberId: string;
    secret: string;
    code: string;
    role: FamilyRole;
  } {
    const familyId = newId('fam');
    const code = this.uniqueCode();
    const secret = newSecret();
    const now = new Date().toISOString();
    const member: StoredMember = {
      memberId: newId('mem'),
      displayName,
      role: 'guardian',
      joinedAt: now,
      secretHash: hashSecret(secret).toString('hex'),
    };
    const leavePinSalt = randomBytes(16).toString('hex');
    this.families.set(familyId, {
      familyId,
      code,
      createdAt: now,
      members: [member],
      alerts: [],
      leavePinSalt,
      leavePinHash: hashPin(leavePin, leavePinSalt),
      pinFailures: 0,
    });
    this.byCode.set(code, familyId);
    this.scheduleWrite();
    return { familyId, memberId: member.memberId, secret, code, role: member.role };
  }

  /** Joins with a code — always as a protected member (see header). */
  join(
    rawCode: string,
    displayName: string,
  ): {
    familyId: string;
    memberId: string;
    secret: string;
    code: string;
    role: FamilyRole;
    members: FamilyMember[];
  } {
    const familyId = this.byCode.get(normalizeJoinCode(rawCode));
    const family = familyId ? this.families.get(familyId) : undefined;
    if (!family) throw new ApiError('NOT_FOUND', 'Unknown join code');
    if (family.members.length >= MAX_MEMBERS) throw new ApiError('BAD_REQUEST', 'This family group is full');
    const secret = newSecret();
    const role: FamilyRole = 'protected';
    const member: StoredMember = {
      memberId: newId('mem'),
      displayName,
      role,
      joinedAt: new Date().toISOString(),
      secretHash: hashSecret(secret).toString('hex'),
    };
    family.members.push(member);
    this.scheduleWrite();
    return {
      familyId: family.familyId,
      memberId: member.memberId,
      secret,
      code: family.code,
      role,
      members: family.members.map(publicMember),
    };
  }

  postAlert(
    familyId: string,
    secret: string | undefined,
    input: {
      memberId: string;
      band: 'high' | 'critical';
      category: IndicatorType;
      source: AlertSourceKind;
      app?: MonitoredAppId;
      demo?: boolean;
    },
  ): FamilyAlert {
    // `app` says which monitored app a DaCy Kids alert came from — and only that.
    if (input.source === 'app' && input.app === undefined) {
      throw new ApiError('BAD_REQUEST', 'app is required when source is "app"');
    }
    if (input.source !== 'app' && input.app !== undefined) {
      throw new ApiError('BAD_REQUEST', 'app is only allowed when source is "app"');
    }
    if (input.app !== undefined && !isMonitoredApp(input.app)) {
      throw new ApiError('BAD_REQUEST', 'app must be one of the monitored app ids');
    }
    const { family, member } = this.authenticate(familyId, secret);
    const sender = family.members.find((m) => m.memberId === input.memberId);
    if (!sender) throw new ApiError('BAD_REQUEST', 'memberId is not a member of this family');
    if (sender.memberId !== member.memberId) {
      throw new ApiError('UNAUTHORIZED', 'x-family-secret does not belong to memberId');
    }
    this.prune(family);
    // Strictly increasing timestamps so `since=<last createdAt>` never skips an alert.
    const last = family.alerts.at(-1);
    const nowMs = Math.max(Date.now(), last ? Date.parse(last.createdAt) + 1 : 0);
    const alert: FamilyAlert = {
      id: newId('alr'),
      familyId: family.familyId,
      fromMemberId: sender.memberId,
      fromName: sender.displayName,
      band: input.band,
      category: input.category,
      source: input.source,
      ...(input.app !== undefined ? { app: input.app } : {}),
      ...(input.demo === true ? { demo: true as const } : {}),
      createdAt: new Date(nowMs).toISOString(),
    };
    family.alerts.push(alert);
    if (family.alerts.length > MAX_ALERTS) family.alerts = family.alerts.slice(-MAX_ALERTS);
    this.scheduleWrite();
    return alert;
  }

  listAlerts(
    familyId: string,
    secret: string | undefined,
    sinceMs: number | null,
  ): { alerts: FamilyAlert[]; members: FamilyMember[]; childSettings: ChildSafetySettings | null } {
    const { family, member } = this.authenticate(familyId, secret);
    const before = family.alerts.length;
    this.prune(family);
    if (family.alerts.length !== before) this.scheduleWrite();
    // Protected members see only their own device's alerts (see header).
    const visible =
      member.role === 'guardian' ? family.alerts : family.alerts.filter((a) => a.fromMemberId === member.memberId);
    const alerts =
      sinceMs === null
        ? visible.slice(-DEFAULT_LIST_LIMIT)
        : visible.filter((a) => Date.parse(a.createdAt) > sinceMs);
    return {
      alerts,
      members: family.members.map(publicMember),
      childSettings: family.childSettings ? copyChildSettings(family.childSettings) : null,
    };
  }

  /**
   * Guardian saves the DaCy Kids settings (which apps the child's device may screen).
   * Apps are de-duplicated and stored in the canonical MONITORED_APP_IDS order.
   */
  updateChildSettings(
    familyId: string,
    secret: string | undefined,
    input: UpdateChildSettingsRequest,
  ): ChildSafetySettings {
    const { family, member } = this.authenticate(familyId, secret);
    if (member.role !== 'guardian') {
      throw new ApiError('UNAUTHORIZED', 'Only a guardian can change child-safety settings');
    }
    if (!input.monitoredApps.every(isMonitoredApp)) {
      throw new ApiError('BAD_REQUEST', 'monitoredApps contains an unknown app id');
    }
    const settings: ChildSafetySettings = {
      enabled: input.enabled,
      monitoredApps: normalizeMonitoredApps(input.monitoredApps),
      childWarnings: input.childWarnings,
      updatedAt: new Date().toISOString(),
    };
    family.childSettings = settings;
    this.scheduleWrite();
    return copyChildSettings(settings);
  }

  /** Checks the guardian's leave PIN with a lockout after repeated failures. */
  private verifyLeavePin(family: StoredFamily, pin: string | undefined): void {
    if (!family.leavePinHash || !family.leavePinSalt) return; // legacy family without a PIN
    const now = Date.now();
    if (family.pinLockedUntil && Date.parse(family.pinLockedUntil) > now) {
      const minutes = Math.ceil((Date.parse(family.pinLockedUntil) - now) / 60_000);
      throw new ApiError('LEAVE_PIN_LOCKED', `Too many wrong PINs. Try again in ${minutes} min.`);
    }
    const expected = Buffer.from(family.leavePinHash, 'hex');
    const provided = Buffer.from(hashPin(pin ?? '', family.leavePinSalt), 'hex');
    const ok = !!pin && expected.length === provided.length && timingSafeEqual(expected, provided);
    if (ok) {
      family.pinFailures = 0;
      family.pinLockedUntil = undefined;
      return;
    }
    const failures = (family.pinFailures ?? 0) + 1;
    if (failures >= LEAVE_PIN_MAX_ATTEMPTS) {
      family.pinFailures = 0;
      family.pinLockedUntil = new Date(now + LEAVE_PIN_LOCK_MS).toISOString();
      this.scheduleWrite();
      throw new ApiError('LEAVE_PIN_LOCKED', 'Too many wrong PINs. Try again in 15 min.');
    }
    family.pinFailures = failures;
    this.scheduleWrite();
    throw new ApiError('LEAVE_PIN_INVALID', `Wrong PIN. ${LEAVE_PIN_MAX_ATTEMPTS - failures} attempt(s) left.`);
  }

  /** Guardian replaces the leave PIN. */
  changeLeavePin(familyId: string, secret: string | undefined, leavePin: string): void {
    const { family, member } = this.authenticate(familyId, secret);
    if (member.role !== 'guardian') throw new ApiError('UNAUTHORIZED', 'Only a guardian can change the leave PIN');
    family.leavePinSalt = randomBytes(16).toString('hex');
    family.leavePinHash = hashPin(leavePin, family.leavePinSalt);
    family.pinFailures = 0;
    family.pinLockedUntil = undefined;
    this.scheduleWrite();
  }

  /**
   * A guardian may remove anyone (including leaving themselves). A protected member may
   * leave only with the guardian's leave PIN — so a child cannot unlink their own phone.
   * Empty families are deleted.
   */
  removeMember(familyId: string, secret: string | undefined, memberId: string, leavePin?: string): void {
    const { family, member } = this.authenticate(familyId, secret);
    const target = family.members.find((m) => m.memberId === memberId);
    if (!target) throw new ApiError('NOT_FOUND', 'Member not found');
    if (target.memberId !== member.memberId && member.role !== 'guardian') {
      throw new ApiError('UNAUTHORIZED', 'Only a guardian can remove another member');
    }
    if (member.role !== 'guardian') this.verifyLeavePin(family, leavePin);
    family.members = family.members.filter((m) => m.memberId !== memberId);
    if (family.members.length === 0) {
      this.families.delete(family.familyId);
      this.byCode.delete(family.code);
    }
    this.scheduleWrite();
  }
}

let store: FamilyStore | null = null;

/** Lazily created so DACY_DATA_DIR can be set (e.g. by tests) before first use. */
export function getFamilyStore(): FamilyStore {
  store ??= new FamilyStore(getDataDir());
  return store;
}

export function flushFamilyStore(): void {
  store?.flush();
}
