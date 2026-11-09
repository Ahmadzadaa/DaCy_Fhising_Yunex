import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { certainty, explainCall, isMention, spokenWarning } from '@/features/callGuard/callExplain';
import { assessRisk } from '@/services/security/riskEngine';
import type { AiIndicator } from '@/types/security';

const ai = (type: AiIndicator['type'], evidence: string, confidence = 0.9): AiIndicator => ({ type, evidence, confidence, rationale: 'test' });

const MENTIONS = [
  'Salam, Kapital Bankdan zəng edirik, kibertəhlükəsizlik şöbəsindən. Kart nömrəsi və CVV haqqında məlumat vermək istəyirik: bu məlumatları heç kimə deməyin.',
  'Kartınızın nömrəsi və CVV kodu kartın arxasındadır. Yeni kartınız filialda hazırdır.',
  'Hello, this is Kapital Bank cybersecurity. Your card number and CVV are private. We will never ask for them.',
  'Sizə SMS ilə gələn kod barədə məlumat veririk, yeni təhlükəsizlik sistemi tətbiq olunub.',
];

describe('mentions are not requests', () => {
  for (const text of MENTIONS) {
    test(`no alarm: ${text.slice(0, 50)}…`, () => {
      const a = assessRisk({ text, context: 'call' });
      assert.equal(a.band, 'low', `score ${a.score}`);
      assert.equal(certainty(a, 5), 'none');
      assert.ok(a.indicators.filter((i) => i.points > 0).every((i) => !i.type.endsWith('_REQUEST') || isMention(i)));
    });
  }

  test('an AI request without an asking verb is only a mention (no combo with authority)', () => {
    const text = MENTIONS[0];
    const a = assessRisk({
      text,
      context: 'call',
      aiIndicators: [ai('CARD_DATA_REQUEST', 'Kart nömrəsi və CVV haqqında məlumat vermək istəyirik', 0.85), ai('AUTHORITY_IMPERSONATION', 'Kapital Bankdan zəng edirik')],
    });
    assert.ok(a.score < 25, `score ${a.score}`);
    assert.equal(a.combos.length, 0);
  });
});

describe('certainty: interrupt only when sure', () => {
  const scam = 'Salam, Kapital Bankın kibertəhlükəsizlik şöbəsindənəm. Kartınızda şübhəli əməliyyat var, bloklamamaq üçün kart nömrənizi və CVV kodunu deyin.';

  test('rules alone: candidate first, sure only after a second confirmation', () => {
    const a = assessRisk({ text: scam, context: 'call' });
    assert.equal(a.band, 'critical');
    assert.equal(certainty(a, 1), 'candidate');
    assert.equal(certainty(a, 2), 'sure');
  });

  test('rules + AI agreeing on the request: sure at once', () => {
    const a = assessRisk({ text: scam, context: 'call', aiIndicators: [ai('CARD_DATA_REQUEST', 'kart nömrənizi və CVV kodunu deyin', 0.95)] });
    assert.equal(certainty(a, 0), 'sure');
  });

  test('high pressure without a real request never becomes sure', () => {
    const a = assessRisk({ text: 'Bu, polisdir. Təcili! Sizin adınıza cinayət işi açılıb, dərhal cavab verin!', context: 'call' });
    assert.notEqual(certainty(a, 10), 'sure');
  });
});

describe('explanations quote the caller', () => {
  test('a mention is explained as harmless, with the quote', () => {
    const a = assessRisk({ text: MENTIONS[1], context: 'call' });
    const ex = explainCall(a, certainty(a, 0));
    const p = ex.points.find((x) => x.tone === 'info' && x.quote);
    assert.ok(p, JSON.stringify(ex.points));
    assert.match(p.text.az, /istənmədi/);
  });

  test('a caller who only says who they are is told apart', () => {
    const a = assessRisk({
      text: 'Salam, Kapital Bankdan zəng edirik, sizə yeni xidmət barədə məlumat vermək istəyirik.',
      context: 'call',
      aiIndicators: [ai('AUTHORITY_IMPERSONATION', 'Kapital Bankdan zəng edirik', 0.8)],
    });
    const ex = explainCall(a, certainty(a, 0));
    assert.match(ex.headline.az, /rəsmi/);
    assert.ok(ex.points.some((p) => /tək başına fırıldaq deyil/.test(p.text.az)));
  });

  test('the spoken warning names the actual request and the claimed authority', () => {
    const a = assessRisk({
      text: 'Kapital Bankın təhlükəsizlik şöbəsindənəm. Kart nömrənizi və CVV kodunu deyin, tez olun.',
      context: 'call',
      aiIndicators: [ai('AUTHORITY_IMPERSONATION', 'Kapital Bankın təhlükəsizlik şöbəsindənəm', 0.9)],
    });
    const s = spokenWarning(a);
    assert.match(s.az, /kart məlumatlarınızı istəyir/);
    assert.match(s.az, /bank/i);
    assert.match(s.en, /card details/);
  });
});
