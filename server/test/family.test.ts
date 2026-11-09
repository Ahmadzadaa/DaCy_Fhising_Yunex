import './setup.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { app } from '../src/app.js';
import type {
  ApiErrorBody,
  CreateFamilyResponse,
  JoinFamilyResponse,
  ListAlertsResponse,
  PostAlertResponse,
} from '../src/contract.js';
import { flushFamilyStore } from '../src/family.js';

function request(method: string, url: string, body?: unknown, secret?: string, leavePin?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (secret !== undefined) headers['x-family-secret'] = secret;
  if (leavePin !== undefined) headers['x-leave-pin'] = leavePin;
  return Promise.resolve(
    app.request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
  );
}

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as ApiErrorBody).error.code;
}

describe('family relay', () => {
  it('create → join → alert → list since → auth errors → validation → leave', async () => {
    // Guardian creates the group.
    const createRes = await request('POST', '/v1/family', { displayName: '  Leyla (mom)  ', leavePin: '2468' });
    assert.equal(createRes.status, 200);
    const created = (await createRes.json()) as CreateFamilyResponse;
    assert.equal(created.role, 'guardian');
    assert.match(created.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    assert.match(created.secret, /^[0-9a-f]{64}$/);
    assert.ok(created.familyId && created.memberId);

    // Protected member joins with a lower-cased code.
    const joinRes = await request('POST', '/v1/family/join', {
      code: created.code.toLowerCase(),
      displayName: 'Ali',
      role: 'protected',
    });
    assert.equal(joinRes.status, 200);
    const joined = (await joinRes.json()) as JoinFamilyResponse;
    assert.equal(joined.familyId, created.familyId);
    assert.equal(joined.role, 'protected');
    assert.notEqual(joined.secret, created.secret);
    assert.deepEqual(
      joined.members.map((m) => [m.displayName, m.role]),
      [
        ['Leyla (mom)', 'guardian'],
        ['Ali', 'protected'],
      ],
    );
    assert.ok(joined.members.every((m) => !('secret' in m) && !('secretHash' in m)));

    // Unknown join code.
    const badJoin = await request('POST', '/v1/family/join', { code: 'ZZZZZZ', displayName: 'X', role: 'protected' });
    assert.equal(badJoin.status, 404);

    const alertsUrl = `/v1/family/${created.familyId}/alerts`;
    const before = new Date(Date.now() - 1000).toISOString();

    // Protected member posts a minimal alert.
    const postRes = await request(
      'POST',
      alertsUrl,
      { memberId: joined.memberId, band: 'critical', category: 'OTP_REQUEST', source: 'call' },
      joined.secret,
    );
    assert.equal(postRes.status, 200);
    const { alert } = (await postRes.json()) as PostAlertResponse;
    assert.equal(alert.familyId, created.familyId);
    assert.equal(alert.fromMemberId, joined.memberId);
    assert.equal(alert.fromName, 'Ali');
    assert.equal(alert.band, 'critical');
    assert.equal(alert.category, 'OTP_REQUEST');
    assert.equal(alert.source, 'call');
    assert.ok(alert.id && !Number.isNaN(Date.parse(alert.createdAt)));

    // Guardian lists alerts since a time before the alert.
    const listRes = await request('GET', `${alertsUrl}?since=${encodeURIComponent(before)}`, undefined, created.secret);
    assert.equal(listRes.status, 200);
    const list = (await listRes.json()) as ListAlertsResponse;
    assert.deepEqual(
      list.alerts.map((a) => a.id),
      [alert.id],
    );
    assert.equal(list.members.length, 2);
    assert.ok(!Number.isNaN(Date.parse(list.serverTime)));

    // Nothing newer than the alert itself; no `since` → last alerts.
    const after = (await (
      await request('GET', `${alertsUrl}?since=${encodeURIComponent(alert.createdAt)}`, undefined, created.secret)
    ).json()) as ListAlertsResponse;
    assert.equal(after.alerts.length, 0);
    const all = (await (await request('GET', alertsUrl, undefined, created.secret)).json()) as ListAlertsResponse;
    assert.equal(all.alerts.length, 1);

    // Bad / missing secret → 401.
    const wrong = await request('GET', alertsUrl, undefined, 'f'.repeat(64));
    assert.equal(wrong.status, 401);
    assert.equal(await errorCode(wrong), 'UNAUTHORIZED');
    assert.equal((await request('GET', alertsUrl)).status, 401);
    assert.equal(
      (
        await request(
          'POST',
          alertsUrl,
          { memberId: joined.memberId, band: 'high', category: 'URGENCY', source: 'message' },
          'nope',
        )
      ).status,
      401,
    );
    // A member cannot post as someone else.
    assert.equal(
      (
        await request(
          'POST',
          alertsUrl,
          { memberId: created.memberId, band: 'high', category: 'URGENCY', source: 'message' },
          joined.secret,
        )
      ).status,
      401,
    );

    // Validation: invalid category / band / source, free-text fields, unknown member, bad since.
    const invalidBodies: unknown[] = [
      { memberId: joined.memberId, band: 'high', category: 'NOT_A_TYPE', source: 'call' },
      { memberId: joined.memberId, band: 'low', category: 'URGENCY', source: 'call' },
      { memberId: joined.memberId, band: 'high', category: 'URGENCY', source: 'email' },
      { memberId: joined.memberId, band: 'high', category: 'URGENCY', source: 'call', text: 'kodu deyin 1234' },
      { memberId: 'mem_unknown', band: 'high', category: 'URGENCY', source: 'call' },
    ];
    for (const body of invalidBodies) {
      const res = await request('POST', alertsUrl, body, joined.secret);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(await errorCode(res), 'BAD_REQUEST');
    }
    assert.equal((await request('GET', `${alertsUrl}?since=yesterday`, undefined, created.secret)).status, 400);

    // displayName validation.
    assert.equal((await request('POST', '/v1/family', { displayName: '   ', leavePin: '2468' })).status, 400);
    assert.equal((await request('POST', '/v1/family', { displayName: 'x'.repeat(41), leavePin: '2468' })).status, 400);
    // leavePin is required and must be 4–8 digits.
    assert.equal((await request('POST', '/v1/family', { displayName: 'Mom' })).status, 400);
    assert.equal((await request('POST', '/v1/family', { displayName: 'Mom', leavePin: '12' })).status, 400);
    assert.equal((await request('POST', '/v1/family', { displayName: 'Mom', leavePin: 'abcd' })).status, 400);

    // Store persisted without plaintext secrets.
    flushFamilyStore();
    const file = readFileSync(path.join(process.env.DACY_DATA_DIR ?? '', 'family.json'), 'utf8');
    assert.ok(file.includes(created.familyId));
    assert.ok(!file.includes(created.secret) && !file.includes(joined.secret));
    assert.ok(!file.includes('"2468"'), 'leave PIN must not be stored in plaintext');

    // A protected member cannot leave without the guardian's PIN (child cannot unlink).
    const leaveUrl = `/v1/family/${created.familyId}/members/${joined.memberId}`;
    const noPin = await request('DELETE', leaveUrl, undefined, joined.secret);
    assert.equal(noPin.status, 403);
    assert.equal(await errorCode(noPin), 'LEAVE_PIN_INVALID');
    const wrongPin = await request('DELETE', leaveUrl, undefined, joined.secret, '1111');
    assert.equal(wrongPin.status, 403);

    // Guardian can change the PIN; protected members cannot.
    const pinUrl = `/v1/family/${created.familyId}/leave-pin`;
    assert.equal((await request('PUT', pinUrl, { leavePin: '9999' }, joined.secret)).status, 401);
    assert.equal((await request('PUT', pinUrl, { leavePin: '1357' }, created.secret)).status, 200);
    assert.equal((await request('DELETE', leaveUrl, undefined, joined.secret, '2468')).status, 403); // old PIN no longer valid

    // Leave: the protected member removes themselves with the PIN; their secret stops working.
    const leave = await request('DELETE', leaveUrl, undefined, joined.secret, '1357');
    assert.equal(leave.status, 200);
    assert.deepEqual(await leave.json(), { ok: true });
    assert.equal((await request('GET', alertsUrl, undefined, joined.secret)).status, 401);
    const remaining = (await (await request('GET', alertsUrl, undefined, created.secret)).json()) as ListAlertsResponse;
    assert.deepEqual(
      remaining.members.map((m) => m.memberId),
      [created.memberId],
    );
  });

  it('locks leaving for 15 minutes after 5 wrong PINs', async () => {
    const created = (await (await request('POST', '/v1/family', { displayName: 'Dad', leavePin: '4321' })).json()) as CreateFamilyResponse;
    const joined = (await (
      await request('POST', '/v1/family/join', { code: created.code, displayName: 'Kid', role: 'protected' })
    ).json()) as JoinFamilyResponse;
    const leaveUrl = `/v1/family/${created.familyId}/members/${joined.memberId}`;
    for (let i = 0; i < 4; i += 1) {
      const res = await request('DELETE', leaveUrl, undefined, joined.secret, '0000');
      assert.equal(await errorCode(res), 'LEAVE_PIN_INVALID');
    }
    const fifth = await request('DELETE', leaveUrl, undefined, joined.secret, '0000');
    assert.equal(fifth.status, 429);
    assert.equal(await errorCode(fifth), 'LEAVE_PIN_LOCKED');
    // Even the correct PIN is refused while locked.
    const locked = await request('DELETE', leaveUrl, undefined, joined.secret, '4321');
    assert.equal(await errorCode(locked), 'LEAVE_PIN_LOCKED');
    // The guardian can still remove the member at any time without a PIN.
    assert.equal((await request('DELETE', leaveUrl, undefined, created.secret)).status, 200);
  });
});
