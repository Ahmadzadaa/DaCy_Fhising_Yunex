/// <reference types="node" />
/**
 * Unit tests for the deterministic risk engine, URL analyzer and text helpers.
 * Run: npm run test:engine  (node --import tsx --test tests/*.test.ts)
 * (TypeScript 6 no longer auto-loads @types/*, hence the reference above.)
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ENGINE_CASES } from './fixtures/engineCases';
import {
  assessRisk,
  detectRuleSignals,
  ENGINE_VERSION,
  scoreToBand,
} from '@/services/security/riskEngine';
import { detectLanguage, foldText, locateEvidence } from '@/services/security/textNormalize';
import {
  analyzeUrlLexical,
  analyzeUrlsInText,
  extractUrls,
  getRegistrableDomain,
  mergeInspection,
} from '@/services/security/urlAnalyzer';
import type { AiIndicator, IndicatorType, ServerUrlInspection } from '@/types/security';

const ai = (type: IndicatorType, evidence: string, confidence = 0.9): AiIndicator => ({
  type,
  evidence,
  confidence,
  rationale: 'test',
});

/* ------------------------------------------------------------------ */

describe('engine regression cases', () => {
  test('there are at least 14 cases with unique ids and both languages', () => {
    assert.ok(ENGINE_CASES.length >= 14);
    const ids = new Set(ENGINE_CASES.map((s) => s.id));
    assert.equal(ids.size, ENGINE_CASES.length);
    for (const s of ENGINE_CASES) {
      assert.ok(s.text.en.trim().length > 20, `${s.id} en text`);
      assert.ok(s.text.az.trim().length > 20, `${s.id} az text`);
      assert.ok(s.title.en && s.title.az, `${s.id} titles`);
    }
    assert.ok(ENGINE_CASES.some((s) => s.kind === 'voice'));
    assert.ok(ENGINE_CASES.some((s) => s.group === 'benign'));
  });

  test('scam scenarios never use real bank names', () => {
    const real = /kapital|birbank|pasha|leobank|unibank|bank of baku|abb\b|xalq bank|rabitabank/i;
    for (const s of ENGINE_CASES) {
      assert.ok(!real.test(s.text.en) && !real.test(s.text.az), `${s.id} mentions a real bank`);
    }
  });

  for (const s of ENGINE_CASES) {
    for (const lang of ['en', 'az'] as const) {
      test(`${s.id} [${lang}] → ${s.expectedBand} (rules only)`, () => {
        const a = assessRisk({ text: s.text[lang], context: s.kind === 'voice' ? 'call' : 'message' });
        assert.equal(a.band, s.expectedBand, `score ${a.score}: ${a.indicators.map((i) => `${i.type}:${i.points}`).join(' ')}`);
        assert.equal(a.engineVersion, ENGINE_VERSION);
        assert.ok(Number.isInteger(a.score) && a.score >= 0 && a.score <= 100);
      });
    }
  }

  test('suspicious scenarios surface the indicators they are tagged with (EN)', () => {
    for (const s of ENGINE_CASES.filter((x) => x.group === 'suspicious')) {
      const types = new Set(assessRisk({ text: s.text.en, context: 'message' }).indicators.map((i) => i.type));
      for (const tag of s.tags) assert.ok(types.has(tag), `${s.id}: missing ${tag}`);
    }
  });
});

/* ------------------------------------------------------------------ */

describe('textNormalize', () => {
  test('foldText is length-preserving on tricky input', () => {
    const input = 'İŞÇİ ƏLİ Ğ ö ü I ı «» ’';
    const out = foldText(input);
    assert.equal(out.length, input.length);
    assert.equal(out, "isci eli g o u i i '' '");
  });

  test('foldText lowercases Cyrillic and keeps emoji length', () => {
    assert.equal(foldText('ПРИВЕТ Мир'), 'привет мир');
    const emoji = 'OK 👍 Ə';
    assert.equal(foldText(emoji).length, emoji.length);
  });

  test('locateEvidence maps folded matches back to original indices', () => {
    const text = 'Salam!  Zəhmət olmasa KODU   tez DEYİN, gözləyirəm.';
    const span = locateEvidence(text, 'kodu tez deyin');
    assert.ok(span);
    assert.equal(text.slice(span.start, span.end), 'KODU   tez DEYİN');

    const quoted = locateEvidence(text, '“Zehmet olmasa”.');
    assert.ok(quoted);
    assert.equal(text.slice(quoted.start, quoted.end), 'Zəhmət olmasa');

    assert.equal(locateEvidence(text, 'send me your PIN'), null);
    assert.equal(locateEvidence(text, ''), null);
  });

  test('detectLanguage', () => {
    assert.equal(detectLanguage(''), 'unknown');
    assert.equal(detectLanguage('Salam, bu mənim yeni nömrəmdir, təcili pul lazımdır.'), 'az');
    assert.equal(detectLanguage('Hello, this is the bank. Please tell me the code you received.'), 'en');
    assert.equal(detectLanguage('Здравствуйте, это служба безопасности банка.'), 'ru');
    assert.equal(detectLanguage('Bonjour, je suis ravi de vous voir demain matin.'), 'other');
  });
});

/* ------------------------------------------------------------------ */

describe('rule signals and hard negatives', () => {
  test('a real bank code notice is not an OTP request', () => {
    const types = detectRuleSignals('Your code is 482913. Never share it with anyone.').map((s) => s.type);
    assert.ok(!types.includes('OTP_REQUEST'));
    const a = assessRisk({ text: 'DemoBank: Your code is 482913. Never share this code with anyone.', context: 'message' });
    assert.equal(a.band, 'low');
    assert.ok(a.indicators.some((i) => i.type === 'PROTECTIVE_ADVICE' && i.points < 0));
  });

  const hardNegatives = [
    'Never share your SMS code or card details with anyone. DemoBank will never ask for them.',
    'SMS kodunu və kart məlumatlarını heç kimə deməyin. DemoBank bu məlumatları heç vaxt soruşmur.',
    'Scam warning from DemoBank: fraudsters call pretending to be bank security and ask you to read them the SMS code. Never share it — hang up and call 145.',
    'DemoBank xəbərdarlıq edir: dələduzlar özlərini bankın təhlükəsizlik şöbəsinin əməkdaşı kimi təqdim edib SMS ilə gələn kodu soruşurlar. Kodu heç kimə deməyin, zəngi bitirin və 145-ə zəng edin.',
    "Police never ask you to move money to a 'safe account'. If someone asks you to install AnyDesk, it is a scam.",
    'Polis heç vaxt pulunuzu “təhlükəsiz hesaba” köçürməyi tələb etmir. Əgər kimsə sizdən AnyDesk yükləməyi istəsə, bu fırıldaqdır.',
    "Please don't tell anyone the code from the SMS.",
  ];
  for (const text of hardNegatives) {
    test(`stays low: ${text.slice(0, 50)}…`, () => {
      const a = assessRisk({ text, context: 'message' });
      assert.equal(a.band, 'low', `score ${a.score}: ${a.indicators.map((i) => `${i.type}:${i.points}`).join(' ')}`);
      const requests = a.indicators.filter((i) =>
        ['OTP_REQUEST', 'CARD_DATA_REQUEST', 'CREDENTIAL_REQUEST', 'SAFE_ACCOUNT_TRANSFER', 'REMOTE_ACCESS_REQUEST'].includes(i.type),
      );
      assert.deepEqual(requests, []);
    });
  }

  test('"don\'t tell anyone" is secrecy when a real request is made', () => {
    for (const text of ["Don't tell anyone, just send me the code from the SMS.", 'Kodu mənə göndər, heç kimə demə.']) {
      const types = assessRisk({ text, context: 'message' }).indicators.map((i) => i.type);
      assert.ok(types.includes('OTP_REQUEST'), text);
      assert.ok(types.includes('SECRECY'), text);
      assert.ok(!types.includes('PROTECTIVE_ADVICE'), text);
    }
  });

  test('protective advice does not reduce the score of a real request', () => {
    const a = assessRisk({ text: 'Never share codes with strangers. Tell me the code you received, quickly.', context: 'call' });
    const protective = a.indicators.find((i) => i.type === 'PROTECTIVE_ADVICE');
    assert.ok(a.indicators.some((i) => i.type === 'OTP_REQUEST'));
    assert.ok(!protective || protective.points === 0);
  });

  test('psychological-only messages are capped at 40', () => {
    const text =
      'URGENT! This is the police. Your account has been blocked, a criminal case is open. Mom, it is me — keep this secret, act now!';
    const a = assessRisk({ text, context: 'message' });
    assert.ok(a.score <= 40, `score ${a.score}`);
    assert.ok(a.indicators.length >= 3);
  });

  test('evidence spans point at the original text', () => {
    const text = 'Salam, DemoBank-ın təhlükəsizlik şöbəsindən narahat edirəm. Sizə SMS ilə gələn kodu tez deyin.';
    for (const s of detectRuleSignals(text)) {
      assert.equal(text.slice(s.span.start, s.span.end), s.evidence);
    }
  });
});

/* ------------------------------------------------------------------ */

describe('AI indicator handling', () => {
  const benign = 'Hi everyone, the thesis seminar is moved to 14:00 in room 305 tomorrow. See you there!';

  test('a fabricated AI request quote is dropped (no false card / code alarm)', () => {
    const a = assessRisk({
      text: benign,
      context: 'call',
      aiIndicators: [ai('OTP_REQUEST', 'tell me the code', 0.9), ai('CARD_DATA_REQUEST', 'read me your CVV', 0.95)],
    });
    assert.equal(a.indicators.find((i) => i.type === 'OTP_REQUEST'), undefined);
    assert.equal(a.indicators.find((i) => i.type === 'CARD_DATA_REQUEST'), undefined);
    assert.equal(a.band, 'low');
  });

  test('a fabricated non-request AI quote gets half confidence and no span', () => {
    const a = assessRisk({ text: benign, context: 'message', aiIndicators: [ai('URGENCY', 'act within ten minutes', 0.9)] });
    const u = a.indicators.find((i) => i.type === 'URGENCY');
    assert.ok(u);
    assert.deepEqual(u.sources, ['ai']);
    assert.equal(u.span, undefined);
    assert.ok(u.confidence <= 0.43, `confidence ${u.confidence}`);
  });

  test('a verified AI quote keeps its span and is capped at 0.85', () => {
    const a = assessRisk({ text: benign, context: 'message', aiIndicators: [ai('URGENCY', 'moved to 14:00', 1)] });
    const u = a.indicators.find((i) => i.type === 'URGENCY');
    assert.ok(u?.span);
    assert.equal(benign.slice(u.span.start, u.span.end), 'moved to 14:00');
    assert.ok(u.confidence <= 0.85);
  });

  test('AI-only psychological indicators cannot exceed the caps', () => {
    const text =
      'Mom it is me, urgent, this is the police, you will be arrested, keep it secret, new number, you won a prize — that is all I wanted to say today.';
    const a = assessRisk({
      text,
      context: 'call',
      aiIndicators: [
        ai('FAMILY_EMERGENCY', 'Mom it is me', 1),
        ai('URGENCY', 'urgent', 1),
        ai('AUTHORITY_IMPERSONATION', 'this is the police', 1),
        ai('THREAT_OR_FEAR', 'you will be arrested', 1),
        ai('SECRECY', 'keep it secret', 1),
        ai('NEW_CONTACT_CHANNEL', 'new number', 1),
        ai('PRIZE_LURE', 'you won a prize', 1),
      ],
    });
    assert.ok(a.score <= 40, `score ${a.score}`);
    for (const i of a.indicators) {
      if (i.sources.length === 1 && i.sources[0] === 'ai') assert.ok(i.confidence <= 0.85, `${i.type} ${i.confidence}`);
    }
  });

  test('AI-only request indicator is capped at 0.85 confidence', () => {
    const text = 'Hello, could you please read the numbers to me when you get them?';
    const a = assessRisk({ text, context: 'call', aiIndicators: [ai('OTP_REQUEST', 'read the numbers to me', 1)] });
    const otp = a.indicators.find((i) => i.type === 'OTP_REQUEST');
    assert.ok(otp);
    assert.equal(otp.confidence, 0.85);
    assert.equal(otp.points, Math.round(45 * 0.85));
  });

  test('AI SUSPICIOUS_URL is ignored when the text has no link', () => {
    const a = assessRisk({ text: benign, context: 'message', aiIndicators: [ai('SUSPICIOUS_URL', 'room 305', 0.9)] });
    assert.ok(!a.indicators.some((i) => i.type === 'SUSPICIOUS_URL'));
  });

  test('rules + AI on the same type are corroborated (+0.1)', () => {
    const text = 'This is the DemoBank security department. Please tell me the code that has just come to you by SMS.';
    const a = assessRisk({ text, context: 'call', aiIndicators: [ai('OTP_REQUEST', 'tell me the code', 0.8)] });
    const otp = a.indicators.find((i) => i.type === 'OTP_REQUEST');
    assert.ok(otp);
    assert.deepEqual([...otp.sources].sort(), ['ai', 'rules']);
    assert.equal(otp.confidence, 1);
    assert.equal(a.confidence, 'high');
  });

  test('confidence: AI ran and found nothing on a clean text → high; tiny text → low', () => {
    assert.equal(assessRisk({ text: benign, context: 'message', aiIndicators: [] }).confidence, 'high');
    assert.equal(assessRisk({ text: 'ok, see you', context: 'message', aiIndicators: [] }).confidence, 'low');
    assert.equal(assessRisk({ text: benign, context: 'message' }).confidence, 'low');
  });
});

/* ------------------------------------------------------------------ */

describe('assessment shape', () => {
  test('scoreToBand boundaries', () => {
    assert.equal(scoreToBand(0), 'low');
    assert.equal(scoreToBand(24), 'low');
    assert.equal(scoreToBand(25), 'moderate');
    assert.equal(scoreToBand(49), 'moderate');
    assert.equal(scoreToBand(50), 'high');
    assert.equal(scoreToBand(74), 'high');
    assert.equal(scoreToBand(75), 'critical');
    assert.equal(scoreToBand(100), 'critical');
  });

  test('low with no indicators: lead-only explanation and a default recommendation', () => {
    const a = assessRisk({ text: 'See you at the seminar tomorrow, bring the printed draft please.', context: 'message' });
    assert.equal(a.band, 'low');
    assert.deepEqual(a.indicators, []);
    assert.ok(a.explanation.en.startsWith('No strong scam signals'));
    assert.equal(a.recommendations.length, 1);
    assert.deepEqual(a.combos, []);
  });

  test('critical scam: sorted indicators, combos, categories, deduped recommendations', () => {
    const s = ENGINE_CASES.find((x) => x.id === 'text-fake-bank-otp');
    assert.ok(s);
    const a = assessRisk({ text: s.text.en, context: 'message' });
    assert.equal(a.band, 'critical');
    for (let i = 1; i < a.indicators.length; i += 1) {
      assert.ok(Math.abs(a.indicators[i - 1]!.points) >= Math.abs(a.indicators[i]!.points));
    }
    assert.ok(a.combos.some((c) => c.id === 'sensitive_pressure' && c.label.az.length > 0));
    assert.ok(a.combos.some((c) => c.id === 'dangerous_link_lure'));
    assert.deepEqual(a.categories, { financial: true, psychological: true, technical: true, childSafety: false });
    const ens = a.recommendations.map((r) => r.en);
    assert.equal(new Set(ens).size, ens.length);
    assert.ok(a.recommendations.length <= 6);
    const url = a.indicators.find((i) => i.type === 'SUSPICIOUS_URL');
    assert.equal(url?.evidence, 'https://demobank-az.top/verify');
    assert.deepEqual(url?.sources, ['url_scan']);
    assert.ok(url?.detail?.en);
    assert.equal(s.text.en.slice(url.span!.start, url.span!.end), url.evidence);
  });
});

/* ------------------------------------------------------------------ */

describe('urlAnalyzer', () => {
  test('bit.ly → medium shortener', () => {
    const r = analyzeUrlLexical('bit.ly/3xK9pQz');
    assert.equal(r.severity, 'medium');
    assert.ok(r.signals.some((s) => s.type === 'URL_SHORTENER'));
  });

  test('http://192.168.1.5 → high (IP host, no https)', () => {
    const r = analyzeUrlLexical('http://192.168.1.5');
    assert.equal(r.severity, 'high');
    const types = r.signals.map((s) => s.type);
    assert.ok(types.includes('IP_HOST') && types.includes('NO_HTTPS'));
  });

  test('punycode → high', () => {
    const r = analyzeUrlLexical('https://xn--pypal-4ve.com/login');
    assert.equal(r.severity, 'high');
    assert.ok(r.signals.some((s) => s.type === 'PUNYCODE_OR_IDN'));
  });

  test('paypa1-secure.top → high brand look-alike + risky TLD', () => {
    const r = analyzeUrlLexical('paypa1-secure.top');
    assert.equal(r.severity, 'high');
    const types = r.signals.map((s) => s.type);
    assert.ok(types.includes('BRAND_LOOKALIKE') && types.includes('RISKY_TLD'));
    assert.ok(r.signals.every((s) => s.detail.en.length > 0 && s.detail.az.length > 0));
  });

  test('https://demobank.az/login → info with OFFICIAL_DOMAIN', () => {
    const r = analyzeUrlLexical('https://demobank.az/login');
    assert.equal(r.severity, 'info');
    assert.deepEqual(r.signals.map((s) => s.type), ['OFFICIAL_DOMAIN']);
  });

  test('no false look-alikes on ordinary words', () => {
    for (const u of ['https://apply-now.com', 'https://pineapple-shop.com', 'https://cloud.example.com', 'https://finance-news.com']) {
      assert.ok(!analyzeUrlLexical(u).signals.some((s) => s.type === 'BRAND_LOOKALIKE'), u);
    }
  });

  test('credentials in URL, excessive subdomains, abb rule', () => {
    assert.ok(analyzeUrlLexical('https://demobank.az@evil.top/x').signals.some((s) => s.type === 'CREDENTIALS_IN_URL'));
    assert.ok(analyzeUrlLexical('https://a.b.c.d.example.com').signals.some((s) => s.type === 'EXCESSIVE_SUBDOMAINS'));
    assert.ok(analyzeUrlLexical('abb-bank-az.top').signals.some((s) => s.type === 'BRAND_LOOKALIKE'));
    assert.ok(!analyzeUrlLexical('https://abbey-road.com').signals.some((s) => s.type === 'BRAND_LOOKALIKE'));
  });

  test('registrable domains with multi-label suffixes', () => {
    assert.equal(getRegistrableDomain('online.demobank.az'), 'demobank.az');
    assert.equal(getRegistrableDomain('www.my.gov.az'), 'my.gov.az');
    assert.equal(getRegistrableDomain('shop.example.co.uk'), 'example.co.uk');
    assert.equal(getRegistrableDomain('evil.vercel.app'), 'evil.vercel.app');
    assert.equal(getRegistrableDomain('192.168.1.5'), '192.168.1.5');
  });

  test('extractUrls: schemes, www, bare domains, punctuation, e-mails, duplicates', () => {
    const text =
      'Visit www.demobank.az, or demobank-az.top/verify! Mail a.b@mail.com (see https://x.co/abc). Again: demobank-az.top/verify. Dr. Aliyev, photo.jpg, 45.90 AZN.';
    const urls = extractUrls(text);
    assert.deepEqual(
      urls.map((u) => u.input),
      ['www.demobank.az', 'demobank-az.top/verify', 'https://x.co/abc'],
    );
    for (const u of urls) assert.equal(text.slice(u.span.start, u.span.end), u.input);
  });

  test('analyzeUrlsInText keeps spans', () => {
    const text = 'Check https://demobank-az.top/verify now';
    const [r] = analyzeUrlsInText(text);
    assert.ok(r?.span);
    assert.equal(text.slice(r.span.start, r.span.end), 'https://demobank-az.top/verify');
  });

  const inspection = (over: Partial<ServerUrlInspection>): ServerUrlInspection => ({
    url: 'https://demobank-az.top/verify',
    finalUrl: null,
    redirects: [],
    httpStatus: 200,
    pageTitle: null,
    hasPasswordField: false,
    hasCardField: false,
    formActionDomains: [],
    domainAgeDays: null,
    tls: true,
    error: null,
    inspectedAt: '2026-11-08T10:00:00.000Z',
    ...over,
  });

  test('mergeInspection adds NEW_DOMAIN and recomputes severity', () => {
    const base = analyzeUrlLexical('https://some-shop.com/item');
    assert.equal(base.severity, 'info');
    const young = mergeInspection(base, inspection({ domainAgeDays: 3 }));
    assert.ok(young.signals.some((s) => s.type === 'NEW_DOMAIN' && s.severity === 'high'));
    assert.equal(young.severity, 'high');
    assert.ok(young.inspection);
    const older = mergeInspection(base, inspection({ domainAgeDays: 90 }));
    assert.equal(older.severity, 'medium');
    // Merging twice replaces server signals instead of duplicating them.
    const twice = mergeInspection(young, inspection({ domainAgeDays: 3 }));
    assert.equal(twice.signals.filter((s) => s.type === 'NEW_DOMAIN').length, 1);
  });

  test('mergeInspection: redirects, forms, unreachable', () => {
    const short = analyzeUrlLexical('https://bit.ly/abc');
    const merged = mergeInspection(
      short,
      inspection({
        finalUrl: 'https://login-demobank.top/x',
        redirects: ['https://bit.ly/abc', 'https://t.co/x', 'https://login-demobank.top/x'],
        hasPasswordField: true,
        hasCardField: true,
      }),
    );
    const sev = (t: string) => merged.signals.find((s) => s.type === t)?.severity;
    assert.equal(sev('REDIRECT_CHAIN'), 'low');
    assert.equal(sev('CROSS_DOMAIN_REDIRECT'), 'high');
    assert.equal(sev('PASSWORD_FORM'), 'medium');
    assert.equal(sev('CARD_FORM'), 'high');
    const down = mergeInspection(short, inspection({ error: 'TIMEOUT', httpStatus: null }));
    assert.equal(down.signals.find((s) => s.type === 'UNREACHABLE')?.severity, 'info');
  });
});
