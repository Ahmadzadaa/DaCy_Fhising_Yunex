/**
 * DaCy Kids on the family relay: guardian-only child-safety settings and alerts
 * that name the monitored app (never its content).
 */
import './setup.js';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { app } from '../src/app.js';
import {
  CHILD_SAFETY_TYPES,
  INDICATOR_TYPES,
  MONITORED_APP_IDS,
  type ApiErrorBody,
  type CreateFamilyResponse,
  type JoinFamilyResponse,
  type ListAlertsResponse,
  type PostAlertResponse,
  type UpdateChildSettingsResponse,
} from '../src/contract.js';
import { ApiError } from '../src/errors.js';
import { FamilyStore, flushFamilyStore, normalizeMonitoredApps } from '../src/family.js';

function request(method: string, url: string, body?: unknown, secret?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (secret !== undefined) headers['x-family-secret'] = secret;
  return Promise.resolve(
    app.request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
  );
}

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as ApiErrorBody).error.code;
}

async function newFamily(): Promise<{ created: CreateFamilyResponse; child: JoinFamilyResponse }> {
  const created = (await (
    await request('POST', '/v1/family', { displayName: 'Nigar (mom)', leavePin: '2580' })
  ).json()) as CreateFamilyResponse;
  const child = (await (
    await request('POST', '/v1/family/join', { code: created.code, displayName: 'Aysu', role: 'protected' })
  ).json()) as JoinFamilyResponse;
  return { created, child };
}

describe('child-safety contract', () => {
  it('adds the six child-safety indicator types and the monitored app ids', () => {
    assert.deepEqual(INDICATOR_TYPES.slice(-6), [...CHILD_SAFETY_TYPES]);
    assert.deepEqual(
      [...CHILD_SAFETY_TYPES],
      ['TRUST_GROOMING', 'PERSONAL_INFO_PROBE', 'GIFT_GROOMING', 'PERSONAL_IMAGE_REQUEST', 'MEETING_REQUEST', 'SEXTORTION_THREAT'],
    );
    assert.equal(new Set(INDICATOR_TYPES).size, INDICATOR_TYPES.length);
    assert.deepEqual(
      [...MONITORED_APP_IDS],
      ['instagram', 'whatsapp', 'telegram', 'tiktok', 'snapchat', 'discord', 'roblox', 'messages'],
    );
  });

  const mobileTypes = fileURLToPath(new URL('../../mobile/src/types/security.ts', import.meta.url));
  it('mirrors the mobile INDICATOR_TYPES and MONITORED_APP_IDS lists exactly', { skip: !existsSync(mobileTypes) }, () => {
    const source = readFileSync(mobileTypes, 'utf8');
    const list = (name: string): string[] => {
      const body = new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`).exec(source)?.[1] ?? '';
      return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    };
    assert.deepEqual(list('INDICATOR_TYPES'), [...INDICATOR_TYPES]);
    assert.deepEqual(list('CHILD_SAFETY_TYPES'), [...CHILD_SAFETY_TYPES]);
    assert.deepEqual(list('MONITORED_APP_IDS'), [...MONITORED_APP_IDS]);
  });

  it('normalizes monitored apps: de-duplicated, canonical order, unknown ids dropped', () => {
    assert.deepEqual(normalizeMonitoredApps(['roblox', 'instagram', 'roblox', 'nope', 'whatsapp']), [
      'instagram',
      'whatsapp',
      'roblox',
    ]);
    assert.deepEqual(normalizeMonitoredApps([]), []);
  });
});

describe('PUT /v1/family/:familyId/child-settings', () => {
  it('guardian sets settings; both members read them from the alert poll', async () => {
    const { created, child } = await newFamily();
    const alertsUrl = `/v1/family/${created.familyId}/alerts`;
    const settingsUrl = `/v1/family/${created.familyId}/child-settings`;

    // Nothing chosen yet → null.
    const empty = (await (await request('GET', alertsUrl, undefined, child.secret)).json()) as ListAlertsResponse;
    assert.equal(empty.childSettings, null);

    const before = Date.now();
    const res = await request(
      'PUT',
      settingsUrl,
      { enabled: true, monitoredApps: ['telegram', 'instagram', 'roblox'], childWarnings: false },
      created.secret,
    );
    assert.equal(res.status, 200);
    const { childSettings } = (await res.json()) as UpdateChildSettingsResponse;
    assert.equal(childSettings.enabled, true);
    assert.equal(childSettings.childWarnings, false);
    assert.deepEqual(childSettings.monitoredApps, ['instagram', 'telegram', 'roblox']);
    assert.ok(Date.parse(childSettings.updatedAt) >= before - 1000);

    // The child device (protected member) and the guardian both see the same settings.
    for (const secret of [child.secret, created.secret]) {
      const list = (await (await request('GET', alertsUrl, undefined, secret)).json()) as ListAlertsResponse;
      assert.deepEqual(list.childSettings, childSettings);
    }

    // Updating replaces the previous choice; switching off keeps the list.
    const off = (await (
      await request('PUT', settingsUrl, { enabled: false, monitoredApps: ['whatsapp'], childWarnings: true }, created.secret)
    ).json()) as UpdateChildSettingsResponse;
    assert.deepEqual(off.childSettings.monitoredApps, ['whatsapp']);
    assert.equal(off.childSettings.enabled, false);
    const list = (await (await request('GET', alertsUrl, undefined, child.secret)).json()) as ListAlertsResponse;
    assert.deepEqual(list.childSettings, off.childSettings);
  });

  it('de-duplicates apps and keeps the canonical order', async () => {
    const { created } = await newFamily();
    const res = await request(
      'PUT',
      `/v1/family/${created.familyId}/child-settings`,
      { enabled: true, monitoredApps: ['discord', 'whatsapp', 'discord', 'whatsapp', 'tiktok'], childWarnings: true },
      created.secret,
    );
    assert.equal(res.status, 200);
    const { childSettings } = (await res.json()) as UpdateChildSettingsResponse;
    assert.deepEqual(childSettings.monitoredApps, ['whatsapp', 'tiktok', 'discord']);
  });

  it('is guardian only: protected member → 401, bad or missing secret → 401', async () => {
    const { created, child } = await newFamily();
    const settingsUrl = `/v1/family/${created.familyId}/child-settings`;
    const body = { enabled: false, monitoredApps: [], childWarnings: false };

    const asChild = await request('PUT', settingsUrl, body, child.secret);
    assert.equal(asChild.status, 401);
    assert.equal(await errorCode(asChild), 'UNAUTHORIZED');
    assert.equal((await request('PUT', settingsUrl, body, 'f'.repeat(64))).status, 401);
    assert.equal((await request('PUT', settingsUrl, body)).status, 401);
    assert.equal((await request('PUT', '/v1/family/fam_missing/child-settings', body, created.secret)).status, 401);

    // The child's attempt changed nothing.
    const list = (await (
      await request('GET', `/v1/family/${created.familyId}/alerts`, undefined, created.secret)
    ).json()) as ListAlertsResponse;
    assert.equal(list.childSettings, null);
  });

  it('validates the body strictly', async () => {
    const { created } = await newFamily();
    const settingsUrl = `/v1/family/${created.familyId}/child-settings`;
    const invalidBodies: unknown[] = [
      { enabled: true, monitoredApps: ['instagram', 'facebook'], childWarnings: true }, // unknown app
      { enabled: true, monitoredApps: ['INSTAGRAM'], childWarnings: true }, // ids are case-sensitive
      { enabled: true, monitoredApps: 'instagram', childWarnings: true }, // not an array
      { enabled: 'yes', monitoredApps: [], childWarnings: true },
      { enabled: true, monitoredApps: [] }, // childWarnings missing
      { enabled: true, monitoredApps: [], childWarnings: true, keywords: ['secret'] }, // unknown key
      { enabled: true, monitoredApps: [...MONITORED_APP_IDS, 'instagram'], childWarnings: true }, // more than 8
    ];
    for (const body of invalidBodies) {
      const res = await request('PUT', settingsUrl, body, created.secret);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(await errorCode(res), 'BAD_REQUEST');
    }
    // All eight apps at once is fine.
    const all = await request(
      'PUT',
      settingsUrl,
      { enabled: true, monitoredApps: [...MONITORED_APP_IDS].reverse(), childWarnings: true },
      created.secret,
    );
    assert.equal(all.status, 200);
    assert.deepEqual(((await all.json()) as UpdateChildSettingsResponse).childSettings.monitoredApps, [...MONITORED_APP_IDS]);
  });
});

describe('alerts from a monitored app (source "app")', () => {
  it('accepts source "app" with an app id and returns it to the guardian', async () => {
    const { created, child } = await newFamily();
    const alertsUrl = `/v1/family/${created.familyId}/alerts`;

    const res = await request(
      'POST',
      alertsUrl,
      { memberId: child.memberId, band: 'critical', category: 'PERSONAL_IMAGE_REQUEST', source: 'app', app: 'instagram' },
      child.secret,
    );
    assert.equal(res.status, 200);
    const { alert } = (await res.json()) as PostAlertResponse;
    assert.equal(alert.source, 'app');
    assert.equal(alert.app, 'instagram');
    assert.equal(alert.category, 'PERSONAL_IMAGE_REQUEST');

    // Other sources carry no app field at all.
    const call = (await (
      await request(
        'POST',
        alertsUrl,
        { memberId: child.memberId, band: 'high', category: 'SEXTORTION_THREAT', source: 'message' },
        child.secret,
      )
    ).json()) as PostAlertResponse;
    assert.ok(!('app' in call.alert));

    const list = (await (await request('GET', alertsUrl, undefined, created.secret)).json()) as ListAlertsResponse;
    assert.deepEqual(
      list.alerts.map((a) => [a.category, a.source, a.app ?? null]),
      [
        ['PERSONAL_IMAGE_REQUEST', 'app', 'instagram'],
        ['SEXTORTION_THREAT', 'message', null],
      ],
    );
  });

  it('enforces the source/app rule and rejects content fields', async () => {
    const { created, child } = await newFamily();
    const alertsUrl = `/v1/family/${created.familyId}/alerts`;
    const base = { memberId: child.memberId, band: 'high', category: 'MEETING_REQUEST' };
    const invalidBodies: unknown[] = [
      { ...base, source: 'app' }, // app missing
      { ...base, source: 'call', app: 'whatsapp' }, // app with a non-app source
      { ...base, source: 'screen', app: 'telegram' },
      { ...base, source: 'app', app: 'facebook' }, // unknown app
      { ...base, source: 'app', app: 'snapchat', text: 'send me a photo of you' }, // never message text
    ];
    for (const body of invalidBodies) {
      const res = await request('POST', alertsUrl, body, child.secret);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(await errorCode(res), 'BAD_REQUEST');
    }
    const list = (await (await request('GET', alertsUrl, undefined, created.secret)).json()) as ListAlertsResponse;
    assert.equal(list.alerts.length, 0);
  });
});

describe('family roles and alert visibility', () => {
  it('joining with a code is always a protected member: role "guardian" → 400', async () => {
    const { created, child } = await newFamily();
    assert.equal(child.role, 'protected');

    const asGuardian = await request('POST', '/v1/family/join', { code: created.code, displayName: 'Aysu', role: 'guardian' });
    assert.equal(asGuardian.status, 400);
    assert.equal(await errorCode(asGuardian), 'BAD_REQUEST');

    // No role at all → protected (default).
    const noRole = (await (
      await request('POST', '/v1/family/join', { code: created.code, displayName: 'Nənə' })
    ).json()) as JoinFamilyResponse;
    assert.equal(noRole.role, 'protected');
    assert.deepEqual(
      noRole.members.map((m) => m.role),
      ['guardian', 'protected', 'protected'],
    );

    // A protected member still cannot change the child settings or the leave PIN.
    const settingsUrl = `/v1/family/${created.familyId}/child-settings`;
    assert.equal((await request('PUT', settingsUrl, { enabled: false, monitoredApps: [], childWarnings: false }, noRole.secret)).status, 401);
  });

  it('a protected member sees only its own alerts; the guardian sees all', async () => {
    const { created, child } = await newFamily();
    const sibling = (await (
      await request('POST', '/v1/family/join', { code: created.code, displayName: 'Brother' })
    ).json()) as JoinFamilyResponse;
    const alertsUrl = `/v1/family/${created.familyId}/alerts`;
    const posted = (await (
      await request(
        'POST',
        alertsUrl,
        { memberId: child.memberId, band: 'critical', category: 'SEXTORTION_THREAT', source: 'app', app: 'instagram' },
        child.secret,
      )
    ).json()) as PostAlertResponse;
    await request('POST', alertsUrl, { memberId: sibling.memberId, band: 'high', category: 'OTP_REQUEST', source: 'call' }, sibling.secret);

    const asSibling = (await (await request('GET', alertsUrl, undefined, sibling.secret)).json()) as ListAlertsResponse;
    assert.deepEqual(asSibling.alerts.map((a) => a.fromMemberId), [sibling.memberId]);
    assert.ok(!asSibling.alerts.some((a) => a.id === posted.alert.id), 'B must not see A’s child-safety alert');

    const asChild = (await (await request('GET', alertsUrl, undefined, child.secret)).json()) as ListAlertsResponse;
    assert.deepEqual(asChild.alerts.map((a) => a.id), [posted.alert.id]);

    const asGuardian = (await (await request('GET', alertsUrl, undefined, created.secret)).json()) as ListAlertsResponse;
    assert.equal(asGuardian.alerts.length, 2);
    // `since` filtering applies to the visible alerts only.
    const since = encodeURIComponent(new Date(0).toISOString());
    const sinceSibling = (await (await request('GET', `${alertsUrl}?since=${since}`, undefined, sibling.secret)).json()) as ListAlertsResponse;
    assert.deepEqual(sinceSibling.alerts.map((a) => a.fromMemberId), [sibling.memberId]);
  });

  it('demo alerts are marked with demo: true (only `true` is accepted)', async () => {
    const { created, child } = await newFamily();
    const alertsUrl = `/v1/family/${created.familyId}/alerts`;
    const base = { memberId: child.memberId, band: 'high', category: 'PERSONAL_IMAGE_REQUEST', source: 'app', app: 'instagram' };
    const res = await request('POST', alertsUrl, { ...base, demo: true }, child.secret);
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as PostAlertResponse).alert.demo, true);
    const real = (await (await request('POST', alertsUrl, base, child.secret)).json()) as PostAlertResponse;
    assert.ok(!('demo' in real.alert));
    for (const demo of [false, 'yes', 1]) {
      const bad = await request('POST', alertsUrl, { ...base, demo }, child.secret);
      assert.equal(bad.status, 400, String(demo));
    }
    const list = (await (await request('GET', alertsUrl, undefined, created.secret)).json()) as ListAlertsResponse;
    assert.deepEqual(list.alerts.map((a) => a.demo ?? false), [true, false]);
  });
});

describe('FamilyStore (direct)', () => {
  it('enforces the guardian and source/app rules and persists child settings and app alerts', async () => {
    const { created, child } = await newFamily();
    const dataDir = process.env.DACY_DATA_DIR ?? '';
    const live = (await (
      await request(
        'PUT',
        `/v1/family/${created.familyId}/child-settings`,
        { enabled: true, monitoredApps: ['roblox', 'discord'], childWarnings: true },
        created.secret,
      )
    ).json()) as UpdateChildSettingsResponse;
    await request(
      'POST',
      `/v1/family/${created.familyId}/alerts`,
      { memberId: child.memberId, band: 'high', category: 'GIFT_GROOMING', source: 'app', app: 'roblox' },
      child.secret,
    );
    flushFamilyStore();

    // A fresh store reads the same state back from disk.
    const reloaded = new FamilyStore(dataDir);
    const listed = reloaded.listAlerts(created.familyId, created.secret, null);
    assert.deepEqual(listed.childSettings, live.childSettings);
    assert.deepEqual(
      listed.alerts.map((a) => [a.category, a.source, a.app]),
      [['GIFT_GROOMING', 'app', 'roblox']],
    );
    const file = readFileSync(path.join(dataDir, 'family.json'), 'utf8');
    assert.ok(file.includes('"childSettings"'));

    const throwsCode = (fn: () => unknown, code: string): void =>
      assert.throws(fn, (err: unknown) => err instanceof ApiError && err.code === code);
    throwsCode(
      () => reloaded.updateChildSettings(created.familyId, child.secret, { enabled: false, monitoredApps: [], childWarnings: false }),
      'UNAUTHORIZED',
    );
    throwsCode(
      () => reloaded.postAlert(created.familyId, child.secret, { memberId: child.memberId, band: 'high', category: 'URGENCY', source: 'app' }),
      'BAD_REQUEST',
    );
    throwsCode(
      () =>
        reloaded.postAlert(created.familyId, child.secret, {
          memberId: child.memberId,
          band: 'high',
          category: 'URGENCY',
          source: 'call',
          app: 'whatsapp',
        }),
      'BAD_REQUEST',
    );
    const saved = reloaded.updateChildSettings(created.familyId, created.secret, {
      enabled: true,
      monitoredApps: ['messages', 'instagram', 'messages'],
      childWarnings: false,
    });
    assert.deepEqual(saved.monitoredApps, ['instagram', 'messages']);
    // Returned objects are copies: mutating them does not change the store.
    saved.monitoredApps.push('tiktok');
    assert.deepEqual(reloaded.listAlerts(created.familyId, created.secret, null).childSettings?.monitoredApps, [
      'instagram',
      'messages',
    ]);
    reloaded.flush();
  });
});
