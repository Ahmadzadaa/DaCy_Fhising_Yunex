/**
 * Family protection state:
 *  - trusted contacts (used by Call Guard's 5-second rule),
 *  - this device's membership in a family relay group (guardian or protected),
 *  - live alert delivery (protected → server → guardian) with local notifications,
 *  - DaCy Kids settings (which apps the child's phone screens), chosen by the guardian
 *    and synced to protected phones through the alert poll.
 *
 * Alerts carry minimal metadata only (risk band, category, source, time) — never
 * message text, audio, transcripts or codes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import {
  changeLeavePinRemote,
  createFamilyRemote,
  joinFamilyRemote,
  leaveFamilyRemote,
  listFamilyAlertsRemote,
  postFamilyAlertRemote,
  updateChildSettingsRemote,
} from '@/services/api/client';
import { isChildSafetyAlert } from '@/constants/childSafetyGuidance';
import { INDICATOR_META } from '@/constants/indicators';
import { MONITORED_APPS } from '@/constants/monitoredApps';
import { tr } from '@/i18n';
import { useServerStatus } from '@/state/serverStatus';
import type { ClientErrorCode } from '@/services/api/client';
import { useSettings } from '@/state/settings';
import { createId } from '@/utils/id';
import {
  MONITORED_APP_IDS,
  type ChildSafetySettings,
  type FamilyAlert,
  type FamilyAlertPayload,
  type FamilyLink,
  type FamilyMember,
  type MonitoredAppId,
  type TrustedContact,
} from '@/types/security';

const STORAGE_KEY = 'dacy.family.v1';
const POLL_MS = 3_000;

interface PersistedFamily {
  contacts: TrustedContact[];
  link: FamilyLink | null;
  /** Alerts produced while not linked/offline (local prototype mode). */
  localAlerts: FamilyAlert[];
  lastSeenAlertAt: string | null;
  /** DaCy Kids settings: from the relay when linked, or saved on this phone (simulator / offline). */
  childSettings: ChildSafetySettings | null;
}

const EMPTY: PersistedFamily = { contacts: [], link: null, localAlerts: [], lastSeenAlertAt: null, childSettings: null };

export type AlertDelivery = 'live' | 'local';

/** `local: true` = the change was kept on this phone only (not linked, offline, or the relay was unreachable). */
export type FamilyActionResult = { ok: true; local?: boolean } | { ok: false; message: string; code?: string };

export interface ChildSettingsInput {
  enabled: boolean;
  monitoredApps: MonitoredAppId[];
  childWarnings: boolean;
}

/** Validates settings from storage or the network; returns null when unusable. */
function sanitizeChildSettings(value: unknown): ChildSafetySettings | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<ChildSafetySettings>;
  if (typeof v.enabled !== 'boolean') return null;
  const apps = Array.isArray(v.monitoredApps)
    ? MONITORED_APP_IDS.filter((id) => (v.monitoredApps as unknown[]).includes(id))
    : [];
  return {
    enabled: v.enabled,
    monitoredApps: apps,
    childWarnings: typeof v.childWarnings === 'boolean' ? v.childWarnings : true,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : new Date(0).toISOString(),
  };
}

/**
 * A settings push rejected with one of these codes is not retried automatically
 * (validation or auth: retrying cannot help). Network errors, timeouts, rate
 * limits and server errors are retried on a later poll.
 */
const NO_RETRY_CODES = new Set<ClientErrorCode>(['BAD_REQUEST', 'UNAUTHORIZED', 'NOT_FOUND']);

/** Key of the settings push guard: per family, so a new family always gets the guardian's settings. */
const pushKey = (familyId: string, updatedAt: string) => `${familyId}:${updatedAt}`;

function sameChildSettings(a: ChildSafetySettings | null, b: ChildSafetySettings | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.enabled === b.enabled &&
    a.childWarnings === b.childWarnings &&
    a.updatedAt === b.updatedAt &&
    a.monitoredApps.length === b.monitoredApps.length &&
    a.monitoredApps.every((id, i) => b.monitoredApps[i] === id)
  );
}

interface FamilyContextValue {
  loaded: boolean;
  contacts: TrustedContact[];
  link: FamilyLink | null;
  members: FamilyMember[];
  /**
   * Alerts received from the relay or created locally, newest first. A guardian sees the
   * whole family; a protected phone only the alerts it sent itself.
   */
  alerts: FamilyAlert[];
  unseenCount: number;
  /** True when linked AND the server is reachable. */
  live: boolean;
  /** DaCy Kids settings (guardian's choice, synced via the relay; null until set). */
  childSettings: ChildSafetySettings | null;
  addContact: (contact: Omit<TrustedContact, 'id'>) => TrustedContact;
  removeContact: (id: string) => void;
  /** Finds a trusted contact by phone number (digits compared, last 9 digits). */
  findTrustedByPhone: (phone: string) => TrustedContact | undefined;
  createFamily: (displayName: string, leavePin: string) => Promise<FamilyActionResult>;
  joinFamily: (code: string, displayName: string) => Promise<FamilyActionResult>;
  /**
   * Leaves the family. Protected members must enter the guardian's leave PIN; the
   * link is only removed locally after the server accepted it.
   */
  leaveFamily: (leavePin?: string) => Promise<FamilyActionResult>;
  /** Guardian only: replace the leave PIN. */
  changeLeavePin: (leavePin: string) => Promise<FamilyActionResult>;
  /**
   * Guardian only (or any device while not linked, for the simulator): saves the DaCy Kids
   * settings. Synced live when linked and online; otherwise kept on this phone (`local: true`)
   * and pushed automatically once the relay is reachable.
   */
  updateChildSettings: (input: ChildSettingsInput) => Promise<FamilyActionResult>;
  /** Sends a minimal alert to the family (or stores it locally in prototype mode). */
  sendAlert: (payload: FamilyAlertPayload) => Promise<AlertDelivery>;
  markAlertsSeen: () => void;
  clearLocalAlerts: () => void;
}

const FamilyContext = createContext<FamilyContextValue | null>(null);

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 9 ? digits.slice(-9) : digits;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function FamilyProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const { baseUrl, status } = useServerStatus();
  const [state, setState] = useState<PersistedFamily>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [remoteAlerts, setRemoteAlerts] = useState<FamilyAlert[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const stateRef = useRef<PersistedFamily>(EMPTY);
  const lastFetchedRef = useRef<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const langRef = useRef(settings.uiLanguage);
  /**
   * `${familyId}:${updatedAt}` of the local child settings already pushed or rejected (avoids retry
   * loops). Keyed by family and cleared on create / join / unlink, so a new family always receives
   * the guardian's settings.
   */
  const childPushRef = useRef<string | null>(null);
  /** Storage not read yet: commits are applied in memory and replayed on top of the stored data. */
  const storageReadyRef = useRef(false);
  const pendingCommitsRef = useRef<((prev: PersistedFamily) => PersistedFamily)[]>([]);

  useEffect(() => {
    langRef.current = settings.uiLanguage;
  }, [settings.uiLanguage]);

  useEffect(() => {
    let cancelled = false;
    const readStored = (json: string | null): PersistedFamily | null => {
      if (!json) return null;
      try {
        const parsed = JSON.parse(json) as Partial<PersistedFamily>;
        return {
          contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
          link: parsed.link && typeof parsed.link === 'object' ? parsed.link : null,
          localAlerts: Array.isArray(parsed.localAlerts) ? parsed.localAlerts : [],
          lastSeenAlertAt: typeof parsed.lastSeenAlertAt === 'string' ? parsed.lastSeenAlertAt : null,
          childSettings: sanitizeChildSettings(parsed.childSettings),
        };
      } catch {
        return null; // Corrupt storage: start fresh.
      }
    };
    AsyncStorage.getItem(STORAGE_KEY)
      .then(readStored, () => null)
      .then((stored) => {
        if (cancelled) return;
        // Commits made before the read (e.g. "mark alerts seen" when the app opens on the
        // Family tab) must not overwrite stored data: replay them on top of it.
        const pending = pendingCommitsRef.current;
        pendingCommitsRef.current = [];
        storageReadyRef.current = true;
        const next = stored ? pending.reduce((acc, updater) => updater(acc), stored) : stateRef.current;
        stateRef.current = next;
        setState(next);
        if (pending.length) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const commit = useCallback((updater: (prev: PersistedFamily) => PersistedFamily) => {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setState(next);
    if (!storageReadyRef.current) {
      pendingCommitsRef.current.push(updater);
      return;
    }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const live = !!state.link && status === 'online';

  /* ---------------- polling for guardian alerts ---------------- */

  useEffect(() => {
    const link = state.link;
    if (!link || status !== 'online') return;
    let stopped = false;

    /**
     * Protected phones follow the relay. The guardian adopts the relay's copy unless this
     * phone holds a newer one (saved while offline/unlinked), which it pushes once.
     */
    const syncChildSettings = async (current: FamilyLink, raw: unknown) => {
      const remote = sanitizeChildSettings(raw);
      const local = stateRef.current.childSettings;
      if (current.role === 'guardian' && local && (!remote || local.updatedAt > remote.updatedAt)) {
        const key = pushKey(current.familyId, local.updatedAt);
        if (childPushRef.current === key) return;
        childPushRef.current = key;
        const res = await updateChildSettingsRemote(baseUrl, current.familyId, current.secret, {
          enabled: local.enabled,
          monitoredApps: local.monitoredApps,
          childWarnings: local.childWarnings,
        });
        if (stopped) return;
        if (res.ok) {
          const synced = sanitizeChildSettings(res.data.childSettings);
          if (synced) {
            childPushRef.current = pushKey(current.familyId, synced.updatedAt);
            commit((prev) => ({ ...prev, childSettings: synced }));
          } else {
            childPushRef.current = null;
          }
        } else if (!NO_RETRY_CODES.has(res.code)) {
          childPushRef.current = null; // offline, timeout, rate limit or server error: retry on a later poll
        }
        return;
      }
      if (current.role === 'guardian' && !remote) return;
      if (!sameChildSettings(remote, local)) commit((prev) => ({ ...prev, childSettings: remote }));
    };

    const poll = async () => {
      if (stopped || AppState.currentState !== 'active') return;
      const res = await listFamilyAlertsRemote(baseUrl, link.familyId, link.secret, lastFetchedRef.current);
      if (stopped) return;
      if (!res.ok) {
        // The family no longer exists on this server (e.g. server data was reset): unlink cleanly.
        if (res.code === 'UNAUTHORIZED' || res.code === 'NOT_FOUND') {
          knownIdsRef.current = new Set();
          lastFetchedRef.current = null;
          childPushRef.current = null;
          setRemoteAlerts([]);
          setMembers([]);
          commit((prev) => ({ ...prev, link: null }));
        }
        return;
      }
      setMembers(res.data.members);
      if ('childSettings' in res.data) void syncChildSettings(link, res.data.childSettings);
      const incoming = res.data.alerts.filter((a) => a.fromMemberId !== link.memberId);
      if (res.data.alerts.length) {
        const newest = res.data.alerts.reduce((max, a) => (a.createdAt > max ? a.createdAt : max), lastFetchedRef.current ?? '');
        lastFetchedRef.current = newest || lastFetchedRef.current;
      } else if (!lastFetchedRef.current) {
        lastFetchedRef.current = res.data.serverTime;
      }
      const fresh = incoming.filter((a) => !knownIdsRef.current.has(a.id));
      if (!fresh.length) return;
      for (const a of fresh) knownIdsRef.current.add(a.id);
      setRemoteAlerts((prev) =>
        [...fresh, ...prev.filter((p) => !fresh.some((f) => f.id === p.id))]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 100),
      );
      if (link.role === 'guardian') {
        const lastSeen = stateRef.current.lastSeenAlertAt ?? '';
        const newest = fresh
          .filter((a) => a.createdAt > lastSeen)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (newest) void notifyGuardian(newest, langRef.current);
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [state.link, status, baseUrl, commit]);

  // Ask for notification permission once a guardian links (local notifications only).
  useEffect(() => {
    if (state.link?.role !== 'guardian' || Platform.OS === 'web') return;
    Notifications.requestPermissionsAsync().catch(() => undefined);
  }, [state.link?.role]);

  /* ---------------- contacts ---------------- */

  const addContact = useCallback(
    (contact: Omit<TrustedContact, 'id'>) => {
      const created: TrustedContact = { ...contact, id: createId('c_') };
      commit((prev) => ({ ...prev, contacts: [...prev.contacts, created] }));
      return created;
    },
    [commit],
  );

  const removeContact = useCallback(
    (id: string) => commit((prev) => ({ ...prev, contacts: prev.contacts.filter((c) => c.id !== id) })),
    [commit],
  );

  const findTrustedByPhone = useCallback((phone: string) => {
    const target = normalizePhone(phone);
    if (!target) return undefined;
    return stateRef.current.contacts.find((c) => normalizePhone(c.phone) === target);
  }, []);

  /* ---------------- family link ---------------- */

  const createFamily = useCallback(
    async (displayName: string, leavePin: string): Promise<FamilyActionResult> => {
      const res = await createFamilyRemote(baseUrl, { displayName: displayName.trim(), leavePin: leavePin.trim() });
      if (!res.ok) return { ok: false, message: res.message };
      const link: FamilyLink = {
        familyId: res.data.familyId,
        memberId: res.data.memberId,
        secret: res.data.secret,
        role: 'guardian',
        displayName: displayName.trim(),
        code: res.data.code,
        linkedAt: new Date().toISOString(),
      };
      lastFetchedRef.current = null;
      knownIdsRef.current = new Set();
      childPushRef.current = null; // the new family has no settings yet: push this phone's choice
      setRemoteAlerts([]);
      commit((prev) => ({ ...prev, link }));
      return { ok: true };
    },
    [baseUrl, commit],
  );

  const joinFamily = useCallback(
    async (code: string, displayName: string): Promise<FamilyActionResult> => {
      const res = await joinFamilyRemote(baseUrl, {
        code: code.trim().toUpperCase(),
        displayName: displayName.trim(),
        role: 'protected',
      });
      if (!res.ok) return { ok: false, message: res.message };
      const link: FamilyLink = {
        familyId: res.data.familyId,
        memberId: res.data.memberId,
        secret: res.data.secret,
        role: 'protected',
        displayName: displayName.trim(),
        code: res.data.code,
        linkedAt: new Date().toISOString(),
      };
      setMembers(res.data.members);
      lastFetchedRef.current = null;
      knownIdsRef.current = new Set();
      childPushRef.current = null;
      setRemoteAlerts([]);
      commit((prev) => ({ ...prev, link }));
      return { ok: true };
    },
    [baseUrl, commit],
  );

  const unlinkLocally = useCallback(() => {
    setRemoteAlerts([]);
    setMembers([]);
    lastFetchedRef.current = null;
    knownIdsRef.current = new Set();
    childPushRef.current = null;
    commit((prev) => ({ ...prev, link: null }));
  }, [commit]);

  const leaveFamily = useCallback(
    async (leavePin?: string): Promise<FamilyActionResult> => {
      const link = stateRef.current.link;
      if (!link) return { ok: true };
      const res = await leaveFamilyRemote(baseUrl, link.familyId, link.secret, link.memberId, leavePin?.trim());
      if (res.ok) {
        unlinkLocally();
        return { ok: true };
      }
      // A guardian may always unlink this device; a protected device may not without the server's OK.
      if (link.role === 'guardian') {
        unlinkLocally();
        return { ok: true };
      }
      return { ok: false, message: res.message, code: res.code };
    },
    [baseUrl, unlinkLocally],
  );

  const changeLeavePin = useCallback(
    async (leavePin: string): Promise<FamilyActionResult> => {
      const link = stateRef.current.link;
      if (!link || link.role !== 'guardian') return { ok: false, message: 'Only the guardian can change the PIN.' };
      const res = await changeLeavePinRemote(baseUrl, link.familyId, link.secret, leavePin.trim());
      return res.ok ? { ok: true } : { ok: false, message: res.message };
    },
    [baseUrl],
  );

  /* ---------------- DaCy Kids settings ---------------- */

  const updateChildSettings = useCallback(
    async (input: ChildSettingsInput): Promise<FamilyActionResult> => {
      const link = stateRef.current.link;
      if (link && link.role !== 'guardian') {
        return {
          ok: false,
          code: 'NOT_GUARDIAN',
          message: langRef.current === 'az' ? 'Bu ayarları yalnız qəyyum dəyişə bilər.' : 'Only the guardian can change these settings.',
        };
      }
      const request: ChildSettingsInput = {
        enabled: input.enabled,
        monitoredApps: MONITORED_APP_IDS.filter((id) => input.monitoredApps.includes(id)),
        childWarnings: input.childWarnings,
      };
      const localCopy: ChildSafetySettings = { ...request, updatedAt: new Date().toISOString() };
      if (link && status === 'online') {
        const res = await updateChildSettingsRemote(baseUrl, link.familyId, link.secret, request);
        const synced = res.ok ? sanitizeChildSettings(res.data.childSettings) : null;
        if (synced) {
          childPushRef.current = pushKey(link.familyId, synced.updatedAt);
          commit((prev) => ({ ...prev, childSettings: synced }));
          return { ok: true };
        }
        // Keep the guardian's choice on this phone so nothing is lost.
        commit((prev) => ({ ...prev, childSettings: localCopy }));
        // Offline, timeout, rate limit or server error: kept here and pushed by a later poll.
        if (!res.ok && !NO_RETRY_CODES.has(res.code)) return { ok: true, local: true };
        childPushRef.current = pushKey(link.familyId, localCopy.updatedAt); // do not auto-retry a rejected update
        return { ok: false, message: res.ok ? 'Invalid server response' : res.message, code: res.ok ? 'INTERNAL' : res.code };
      }
      commit((prev) => ({ ...prev, childSettings: localCopy }));
      return { ok: true, local: true };
    },
    [baseUrl, commit, status],
  );

  /* ---------------- alerts ---------------- */

  const sendAlert = useCallback(
    async (payload: FamilyAlertPayload): Promise<AlertDelivery> => {
      const link = stateRef.current.link;
      if (link && status === 'online') {
        const res = await postFamilyAlertRemote(baseUrl, link.familyId, link.secret, {
          memberId: link.memberId,
          band: payload.band,
          category: payload.category,
          source: payload.source,
          ...(payload.app ? { app: payload.app } : {}),
          ...(payload.demo ? { demo: true as const } : {}),
        });
        if (res.ok) {
          knownIdsRef.current.add(res.data.alert.id);
          setRemoteAlerts((prev) => [res.data.alert, ...prev.filter((a) => a.id !== res.data.alert.id)]);
          return 'live';
        }
      }
      const local: FamilyAlert = {
        ...payload,
        id: createId('a_'),
        familyId: link?.familyId ?? 'local',
        fromMemberId: link?.memberId ?? 'this-device',
        fromName: link?.displayName ?? (langRef.current === 'az' ? 'Bu cihaz' : 'This device'),
        createdAt: new Date().toISOString(),
      };
      commit((prev) => ({ ...prev, localAlerts: [local, ...prev.localAlerts].slice(0, 50) }));
      return 'local';
    },
    [baseUrl, commit, status],
  );

  const alerts = useMemo(() => {
    const all = [...remoteAlerts, ...state.localAlerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const link = state.link;
    // A protected phone (a child, a grandparent) never lists another member's alerts.
    if (link?.role === 'protected') return all.filter((a) => a.fromMemberId === link.memberId || a.familyId === 'local');
    return all;
  }, [remoteAlerts, state.localAlerts, state.link]);

  const unseenCount = useMemo(() => {
    const lastSeen = state.lastSeenAlertAt ?? '';
    const own = state.link?.memberId;
    return remoteAlerts.filter((a) => a.createdAt > lastSeen && a.fromMemberId !== own).length;
  }, [remoteAlerts, state.lastSeenAlertAt, state.link?.memberId]);

  const markAlertsSeen = useCallback(() => {
    commit((prev) => ({ ...prev, lastSeenAlertAt: new Date().toISOString() }));
  }, [commit]);

  const clearLocalAlerts = useCallback(() => commit((prev) => ({ ...prev, localAlerts: [] })), [commit]);

  const value = useMemo<FamilyContextValue>(
    () => ({
      loaded,
      contacts: state.contacts,
      link: state.link,
      members,
      alerts,
      unseenCount,
      live,
      childSettings: state.childSettings,
      addContact,
      removeContact,
      findTrustedByPhone,
      createFamily,
      joinFamily,
      leaveFamily,
      changeLeavePin,
      updateChildSettings,
      sendAlert,
      markAlertsSeen,
      clearLocalAlerts,
    }),
    [
      loaded,
      state.contacts,
      state.link,
      members,
      alerts,
      unseenCount,
      live,
      state.childSettings,
      addContact,
      removeContact,
      findTrustedByPhone,
      createFamily,
      joinFamily,
      leaveFamily,
      changeLeavePin,
      updateChildSettings,
      sendAlert,
      markAlertsSeen,
      clearLocalAlerts,
    ],
  );

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}

async function notifyGuardian(alert: FamilyAlert, lang: 'en' | 'az'): Promise<void> {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  if (Platform.OS === 'web') return;
  const category = tr(INDICATOR_META[alert.category].label, lang);
  const risk = alert.band === 'critical' ? (lang === 'az' ? 'Kritik' : 'Critical') : lang === 'az' ? 'Yüksək' : 'High';
  const where = alert.source === 'app' && alert.app && MONITORED_APPS[alert.app] ? ` · ${MONITORED_APPS[alert.app].name}` : '';
  // Child-safety alerts: the first thing a parent needs is to stay calm and not blame the child.
  const next = isChildSafetyAlert(alert)
    ? lang === 'az'
      ? 'Sakit olun, uşağınızı günahlandırmayın — növbəti addımlar üçün DaCy-ni açın.'
      : 'Stay calm and don’t blame your child — open DaCy for next steps.'
    : lang === 'az'
      ? 'Zəng edib yoxlayın.'
      : 'Call them to check in.';
  const demo = alert.demo ? 'Demo · ' : '';
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        // Child-safety pushes stay neutral on the lock screen: no child name, no category.
        // The details and guidance are shown only inside the app.
        title: isChildSafetyAlert(alert)
          ? `${demo}${lang === 'az' ? 'DaCy Ailə' : 'DaCy Family'}`
          : `${demo}${lang === 'az' ? `DaCy: ${alert.fromName} üçün təhlükə` : `DaCy: risk for ${alert.fromName}`}`,
        body: isChildSafetyAlert(alert)
          ? lang === 'az'
            ? `Uşaq təhlükəsizliyi xəbərdarlığı var. ${next}`
            : `A child-safety alert needs your attention. ${next}`
          : lang === 'az'
            ? `Risk: ${risk} · Hadisə: ${category}${where}. ${next}`
            : `Risk: ${risk} · Event: ${category}${where}. ${next}`,
      },
      trigger: null,
    });
  } catch {
    // Notifications may be unavailable or denied; the in-app banner still shows.
  }
}

export function useFamily(): FamilyContextValue {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error('useFamily must be used inside <FamilyProvider>');
  return ctx;
}
