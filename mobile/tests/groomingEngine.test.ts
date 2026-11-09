/// <reference types="node" />
/**
 * Unit tests for DaCy Kids: child-safety lexicon, risk-engine child-safety
 * scoring and the conversation-level grooming engine.
 * Run: npm run test:engine  (node --import tsx --test tests/*.test.ts)
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { guardianAlertGuidance, isChildSafetyAlert } from '@/constants/childSafetyGuidance';
import { KIDS_SCENARIOS, toChatMessages } from '@/constants/kidsScenarios';
import {
  alertPriorityRank,
  assessConversation,
  GROOMING_ENGINE_VERSION,
  messageSignals,
  STAGE_META,
  stageForTypes,
} from '@/services/security/groomingEngine';
import { assessRisk, detectRuleSignals, ENGINE_VERSION } from '@/services/security/riskEngine';
import type { ChatMessage, IndicatorType } from '@/types/security';
import { CHILD_SAFETY_TYPES, GROOMING_STAGES, MONITORED_APP_IDS } from '@/types/security';

const typesOf = (text: string) => detectRuleSignals(text).map((s) => s.type);

const DAY = 86_400_000;
const T0 = Date.parse('2026-10-01T12:00:00.000Z');
const msg = (id: string, from: ChatMessage['from'], text: string, day: number): ChatMessage => ({
  id,
  from,
  text,
  at: new Date(T0 + (day - 1) * DAY).toISOString(),
});

/* ------------------------------------------------------------------ */

describe('child-safety lexicon (EN + AZ)', () => {
  const positives: [IndicatorType, string][] = [
    ['TRUST_GROOMING', 'You are so mature for your age.'],
    ['TRUST_GROOMING', 'Only I understand you.'],
    ['TRUST_GROOMING', "You're special."],
    ['TRUST_GROOMING', "It's our little secret."],
    ['TRUST_GROOMING', 'I care about you more than they do.'],
    ['TRUST_GROOMING', 'Yaşına görə çox yetkinsən.'],
    ['TRUST_GROOMING', 'Səni ancaq mən başa düşürəm.'],
    ['TRUST_GROOMING', 'Sən xüsusisən.'],
    ['TRUST_GROOMING', 'Səni onlardan çox düşünürəm.'],
    ['PERSONAL_INFO_PROBE', 'How old are you?'],
    ['PERSONAL_INFO_PROBE', 'Which school do you go to?'],
    ['PERSONAL_INFO_PROBE', 'Where do you live?'],
    ['PERSONAL_INFO_PROBE', 'Are you home alone?'],
    ['PERSONAL_INFO_PROBE', 'When are your parents out?'],
    ['PERSONAL_INFO_PROBE', "What's your address?"],
    ['PERSONAL_INFO_PROBE', 'Neçə yaşın var?'],
    ['PERSONAL_INFO_PROBE', 'Hansı məktəbdə oxuyursan?'],
    ['PERSONAL_INFO_PROBE', 'Harada yaşayırsan?'],
    ['PERSONAL_INFO_PROBE', 'Evdə təksən?'],
    ['PERSONAL_INFO_PROBE', 'Valideynlərin nə vaxt evdə olmur?'],
    ['PERSONAL_INFO_PROBE', 'Ünvanını yaz.'],
    ['GIFT_GROOMING', "I'll buy you a new skin."],
    ['GIFT_GROOMING', 'I can send you a gift card.'],
    ['GIFT_GROOMING', 'Want some free robux?'],
    ['GIFT_GROOMING', "I'll send you some money."],
    ['GIFT_GROOMING', 'Sənə hədiyyə alaram.'],
    ['GIFT_GROOMING', 'Robux göndərərəm.'],
    ['GIFT_GROOMING', 'Sənə hədiyyə kartı alaram.'],
    ['PERSONAL_IMAGE_REQUEST', 'Send me a photo of you.'],
    ['PERSONAL_IMAGE_REQUEST', 'Send a picture of yourself.'],
    ['PERSONAL_IMAGE_REQUEST', 'A private photo, just for me.'],
    ['PERSONAL_IMAGE_REQUEST', 'Send me a private photo.'],
    ['PERSONAL_IMAGE_REQUEST', 'Şəxsi bir şəkil olsun.'],
    ['PERSONAL_IMAGE_REQUEST', 'Delete it after.'],
    ['PERSONAL_IMAGE_REQUEST', 'Show me what you look like.'],
    ['PERSONAL_IMAGE_REQUEST', 'Turn on your camera.'],
    ['PERSONAL_IMAGE_REQUEST', 'Özünün şəklini göndər.'],
    ['PERSONAL_IMAGE_REQUEST', 'Şəklini at.'],
    ['PERSONAL_IMAGE_REQUEST', 'Şəxsi şəkil istəyirəm.'],
    ['PERSONAL_IMAGE_REQUEST', 'Sonra silərsən.'],
    ['PERSONAL_IMAGE_REQUEST', 'Kameranı aç.'],
    ['MEETING_REQUEST', "Let's meet."],
    ['MEETING_REQUEST', 'Come alone.'],
    ['MEETING_REQUEST', "I'll pick you up."],
    ['MEETING_REQUEST', 'Meet me at the park.'],
    ['MEETING_REQUEST', 'Görüşək.'],
    ['MEETING_REQUEST', 'Tək gəl.'],
    ['MEETING_REQUEST', 'Səni maşınla götürərəm.'],
    ['SEXTORTION_THREAT', "If you don't send more I'll share your photo with your friends."],
    ['SEXTORTION_THREAT', "If you don't send it, I'll post it on Instagram."],
    ['SEXTORTION_THREAT', 'Send more or I will send your pics to your school.'],
    ['SEXTORTION_THREAT', "I'll expose you."],
    ['SEXTORTION_THREAT', 'Göndərməsən, şəklini dostlarına göndərəcəm.'],
    ['SEXTORTION_THREAT', 'Göndərməsən, hamı görəcək.'],
    ['SEXTORTION_THREAT', 'Səni rüsvay edəcəm.'],
    ['SEXTORTION_THREAT', "If you don't send another photo, I'll share your photos."],
    ['SEXTORTION_THREAT', "If you don't send more pics I'll post your pics"],
    ['SEXTORTION_THREAT', 'Send me another photo of you or everyone will see your photos.'],
    ['SECRECY', "Don't tell your parents."],
    ['SECRECY', "Don't tell your mom about this."],
    ['SECRECY', 'Keep this between us.'],
    ['SECRECY', 'Delete our chat.'],
    ['SECRECY', 'Valideynlərinə demə.'],
    ['SECRECY', 'Yazışmamızı sil.'],
    ['NEW_CONTACT_CHANNEL', "Let's talk on Snapchat, it's more private."],
    ['NEW_CONTACT_CHANNEL', 'Snapchat-a keç.'],
    ['NEW_CONTACT_CHANNEL', 'Teleqramda yazışaq, daha gizli.'],
  ];
  for (const [type, text] of positives) {
    test(`${type} ← ${text}`, () => {
      assert.ok(typesOf(text).includes(type), `got ${typesOf(text).join(', ') || 'nothing'}`);
    });
  }

  test('"our little secret" is both trust-building and secrecy', () => {
    const t = typesOf("It's our little secret.");
    assert.ok(t.includes('TRUST_GROOMING') && t.includes('SECRECY'));
  });

  const imageNegatives = [
    'Send a photo of the math homework page.',
    'Can you send me a pic of the cat?',
    'Send me the photos from the trip.',
    'Send me a screenshot of the notes.',
    'We took a selfie at the park.',
    'Never send photos of yourself to strangers.',
    "Don't post personal photos online.",
    'Riyaziyyat ev tapşırığının səhifəsinin şəklini at.',
    'Pişiyin şəklini at!',
    'Şəxsi şəkillərini heç kimə göndərmə.',
    "Let's make a special video for Mrs. Smith's birthday.",
    "It's a private video, I can't open it.",
    "let's join private ones",
    'Müəllim üçün xüsusi video hazırlayaq.',
  ];
  for (const text of imageNegatives) {
    test(`not a personal image request: ${text}`, () => {
      assert.ok(!typesOf(text).includes('PERSONAL_IMAGE_REQUEST'), typesOf(text).join(', '));
    });
  }

  const threatNegatives = [
    'Everyone will see the show tomorrow.',
    "I'll send the photos to everyone in class.",
    "If you don't reply I'll send you the notes later.",
    "If you don't want it I'll send it back.",
    'Send me the link or I will post it myself.',
    'Hamı görəcək, sabah konsertdir.',
    'Toy şəkillərini ailəyə göndərəcəm.',
    'Cavab yazmasan, sənə sonra mesaj göndərəcəm.',
    'Mesajı göndər, yoxsa mən göndərərəm.',
    // Unconditional "your photos" statements: a coach, a teacher or a grandparent says them too.
    "I'll send your photos to your parents tonight.",
    "I'll post your pics on the school instagram.",
    'Your parents will see your photos at the exhibition.',
    'Senin şəkillərini valideynlərinə göndərəcəm.',
  ];
  for (const text of threatNegatives) {
    test(`not sextortion: ${text}`, () => {
      assert.ok(!typesOf(text).includes('SEXTORTION_THREAT'), typesOf(text).join(', '));
    });
  }

  test('ordinary friendly phrases stay clean', () => {
    for (const text of ["Good game! You're a great teammate.", 'Same time tomorrow?', 'Sabah görüşərik!', 'See you in class.']) {
      assert.deepEqual(
        typesOf(text).filter((t) => CHILD_SAFETY_TYPES.includes(t)),
        [],
        text,
      );
    }
  });

  test('"I would never ask…" does not neutralise a child-safety request', () => {
    assert.ok(typesOf('I would never ask you for anything weird, just send me a photo of you.').includes('PERSONAL_IMAGE_REQUEST'));
    // …but the institutional disclaimer still neutralises financial requests.
    assert.ok(!typesOf('DemoBank will never ask for your card number.').includes('CARD_DATA_REQUEST'));
  });

  test('a safety lesson about strangers is not a request', () => {
    const t = typesOf('Strangers online may ask you to send a photo of yourself — always tell a parent.');
    assert.ok(!t.includes('PERSONAL_IMAGE_REQUEST'), t.join(', '));
  });

  test('a conditional threat is never read as "don\'t send photos" advice (EN)', () => {
    for (const text of ["If you don't send another photo, I'll share your photos.", "If you don't send more pics I'll post your pics"]) {
      const t = typesOf(text);
      assert.ok(t.includes('SEXTORTION_THREAT') && !t.includes('PROTECTIVE_ADVICE'), `${text}: ${t.join(', ')}`);
      const a = assessRisk({ text, context: 'message' });
      assert.ok(a.score >= 80 && a.band === 'critical', `${a.score}: ${text}`);
      const c = assessConversation([msg('t', 'contact', text, 1)]);
      assert.ok(c.shouldAlert && c.stage === 'coercion' && c.score >= 80, `${c.score} ${c.stage}: ${text}`);
      assert.equal(c.alertCategory, 'SEXTORTION_THREAT');
    }
    // Real advice is still advice.
    assert.ok(typesOf('Never send photos of yourself to strangers.').includes('PROTECTIVE_ADVICE'));
  });

  test('"don\'t tell your mom" stays grooming secrecy when the clause mentions a gift or Robux code (EN + AZ)', () => {
    for (const text of [
      "I'll send you a Robux gift card code, just don't tell your mom.",
      'Sənə Robux kodu göndərərəm, anana demə.',
      'Robux kodunu göndərdim, valideynlərinə heç nə demə.',
    ]) {
      const t = typesOf(text);
      assert.ok(t.includes('SECRECY') && !t.includes('PROTECTIVE_ADVICE'), `${text}: ${t.join(', ')}`);
      const a = assessRisk({ text, context: 'message' });
      assert.ok(!a.indicators.some((i) => i.points < 0), `${text}: no protective discount`);
      const c = assessConversation([msg('g', 'contact', text, 1)]);
      assert.ok(c.stagesReached.includes('isolation'), `${text}: ${c.stagesReached.join(',')}`);
    }
    // "Don't tell anyone your code" is still protective advice.
    for (const text of ["Please don't tell anyone the code from the SMS.", 'Kodu heç kimə deməyin.']) {
      assert.deepEqual(typesOf(text), ['PROTECTIVE_ADVICE'], text);
    }
  });

  test('evidence spans point at the original Azerbaijani text', () => {
    const text = 'Göndərməsən, şəkillərini bütün dostlarına göndərəcəm. Özünün şəklini göndər!';
    const signals = detectRuleSignals(text);
    assert.ok(signals.length >= 2);
    for (const s of signals) assert.equal(text.slice(s.span.start, s.span.end), s.evidence);
  });
});

/* ------------------------------------------------------------------ */

describe('risk engine: child-safety scoring', () => {
  test('engine version is bumped', () => {
    assert.equal(ENGINE_VERSION, 'dacy-risk-1.2.0');
  });

  test('sextortion is always critical (≥ 80), EN and AZ', () => {
    for (const text of [
      "If you don't send more I'll share your photo with your friends.",
      'Göndərməsən, şəklini dostlarına göndərəcəm.',
    ]) {
      const a = assessRisk({ text, context: 'message' });
      assert.ok(a.score >= 80, `${a.score}: ${text}`);
      assert.equal(a.band, 'critical');
      assert.equal(a.categories.childSafety, true);
      assert.ok(a.recommendations.some((r) => r.en.includes('police')));
    }
  });

  test('secrecy + photo request combo (+15)', () => {
    const a = assessRisk({ text: "Don't tell your parents. Send me a photo of you.", context: 'message' });
    const combo = a.combos.find((c) => c.id === 'secrecy_image');
    assert.ok(combo && combo.points === 15 && combo.label.az.length > 0);
    assert.ok(a.score >= 50, `score ${a.score}`);
  });

  test('trust or gift + photo request combo (+10)', () => {
    for (const text of ["You're so mature for your age. Send me a selfie.", "I'll buy you robux if you send me a photo of you."]) {
      const a = assessRisk({ text, context: 'message' });
      assert.ok(a.combos.some((c) => c.id === 'grooming_image' && c.points === 10), text);
    }
  });

  test('secret meeting combo (+15)', () => {
    const a = assessRisk({ text: "Don't tell anyone. Let's meet at the mall, come alone.", context: 'message' });
    assert.ok(a.combos.some((c) => c.id === 'secret_meeting' && c.points === 15));
    assert.ok(a.score >= 50, `score ${a.score}`);
  });

  test('early grooming signals alone are capped like psychological pressure', () => {
    const a = assessRisk({
      text: "You're so mature for your age. Only I understand you. I'll buy you robux. How old are you? Are you home alone? It's our little secret.",
      context: 'message',
    });
    assert.ok(a.score <= 40, `score ${a.score}`);
    assert.ok(a.indicators.length >= 4);
    assert.equal(a.categories.childSafety, true);
  });

  test('child-safety requests are request-type: no cap, protective advice does not offset them', () => {
    const a = assessRisk({ text: 'Never share codes with strangers. Send me a photo of you, it is our secret.', context: 'message' });
    assert.ok(a.indicators.some((i) => i.type === 'PERSONAL_IMAGE_REQUEST'));
    const protective = a.indicators.find((i) => i.type === 'PROTECTIVE_ADVICE');
    assert.ok(!protective || protective.points === 0);
    assert.ok(a.score > 40, `score ${a.score}`);
  });

  test('explanations and recommendations come from the catalogue in both languages', () => {
    const a = assessRisk({ text: 'Send me a photo of you.', context: 'message' });
    assert.ok(a.explanation.en.includes('photos') && a.explanation.az.includes('şəkil'));
    assert.ok(a.recommendations.every((r) => r.en.length > 0 && r.az.length > 0));
  });
});

/* ------------------------------------------------------------------ */

describe('grooming engine: stages', () => {
  test('stage meta: levels 0..5 in GROOMING_STAGES order, bilingual labels', () => {
    GROOMING_STAGES.forEach((s, i) => {
      assert.equal(STAGE_META[s].level, i);
      assert.ok(STAGE_META[s].label.en && STAGE_META[s].label.az && STAGE_META[s].description.az);
    });
  });

  test('stageForTypes returns the highest stage, independent of order', () => {
    const cases: [IndicatorType[], string][] = [
      [[], 'none'],
      [['OTP_REQUEST', 'URGENCY'], 'none'],
      [['GIFT_GROOMING'], 'trust'],
      [['TRUST_GROOMING', 'SECRECY'], 'isolation'],
      [['NEW_CONTACT_CHANNEL'], 'isolation'],
      [['SECRECY', 'PERSONAL_INFO_PROBE'], 'probing'],
      [['MEETING_REQUEST', 'TRUST_GROOMING'], 'probing'],
      [['PERSONAL_IMAGE_REQUEST', 'TRUST_GROOMING', 'SECRECY'], 'image_request'],
      [['THREAT_OR_FEAR'], 'coercion'],
      [['PERSONAL_IMAGE_REQUEST', 'SEXTORTION_THREAT', 'GIFT_GROOMING'], 'coercion'],
    ];
    for (const [types, expected] of cases) {
      assert.equal(stageForTypes(types), expected, types.join('+'));
      assert.equal(stageForTypes([...types].reverse()), expected, `reversed ${types.join('+')}`);
    }
  });
});

describe('grooming engine: scenarios', () => {
  test('scenario catalogue: ≥ 4, unique ids, both languages, valid apps, chronological', () => {
    assert.ok(KIDS_SCENARIOS.length >= 4);
    assert.equal(new Set(KIDS_SCENARIOS.map((s) => s.id)).size, KIDS_SCENARIOS.length);
    for (const s of KIDS_SCENARIOS) {
      assert.ok(MONITORED_APP_IDS.includes(s.app), s.id);
      assert.ok(s.title.en && s.title.az && s.contactName, s.id);
      let prev = -Infinity;
      for (const m of s.messages) {
        assert.ok(m.text.en.trim() && m.text.az.trim(), `${s.id}: empty text`);
        assert.match(m.time, /^\d{2}:\d{2}$/);
        const t = m.day * 1440 + Number(m.time.slice(0, 2)) * 60 + Number(m.time.slice(3));
        assert.ok(t >= prev, `${s.id}: not chronological at day ${m.day} ${m.time}`);
        prev = t;
      }
    }
    for (const id of ['grooming-28-days', 'classmate-homework', 'gaming-teammate', 'meeting-request']) {
      assert.ok(KIDS_SCENARIOS.some((s) => s.id === id), id);
    }
  });

  test('scenario text stays non-explicit', () => {
    const explicit = /\b(?:nude|naked|sex\w*|undress\w*|body|lingerie|cılpaq|çılpaq|soyun\w*|intim\w*)\b/i;
    for (const s of KIDS_SCENARIOS) {
      for (const m of s.messages) assert.ok(!explicit.test(m.text.en) && !explicit.test(m.text.az), `${s.id}: ${m.text.en}`);
    }
  });

  for (const s of KIDS_SCENARIOS) {
    for (const lang of ['en', 'az'] as const) {
      test(`${s.id} [${lang}] → ${s.expected}`, () => {
        const messages = toChatMessages(s, lang);
        const a = assessConversation(messages);
        assert.equal(a.shouldAlert, s.expected === 'alert', `score ${a.score} ${a.band}: ${a.indicators.map((i) => `${i.type}:${i.points}`).join(' ')}`);
        assert.equal(a.engineVersion, GROOMING_ENGINE_VERSION);
        assert.ok(Number.isInteger(a.score) && a.score >= 0 && a.score <= 100);
        assert.deepEqual(a.perMessage.map((p) => p.messageId), messages.map((m) => m.id));
        assert.equal(a.perMessage.at(-1)?.score, a.score);
        assert.ok(a.explanation.en && a.explanation.az && a.childTip.en && a.childTip.az);
        assert.ok(a.guardianActions.length > 0 && a.guardianActions.every((g) => g.en && g.az));
        if (s.expected === 'no_alert') {
          assert.equal(a.band, 'low');
          assert.deepEqual(a.indicators.filter((i) => i.category === 'child_safety'), []);
          assert.equal(a.alertCategory, null);
        } else {
          assert.ok(a.alertCategory && CHILD_SAFETY_TYPES.includes(a.alertCategory));
        }
      });
    }
  }

  const firstAlertIndex = (messages: ChatMessage[]) =>
    messages.findIndex((_, i) => assessConversation(messages.slice(0, i + 1)).shouldAlert);

  for (const lang of ['en', 'az'] as const) {
    test(`grooming-28-days [${lang}]: alert first fires at the photo request, ends in coercion`, () => {
      const s = KIDS_SCENARIOS.find((x) => x.id === 'grooming-28-days')!;
      const messages = toChatMessages(s, lang);
      assert.ok(messages.length >= 14 && messages.length <= 18);
      assert.ok(s.messages.at(-1)!.day === 28 && s.messages[0]!.day === 1);

      const firstPhoto = messages.findIndex((m) => messageSignals(m).some((x) => x.type === 'PERSONAL_IMAGE_REQUEST'));
      assert.ok(firstPhoto > 0);
      assert.equal(firstAlertIndex(messages), firstPhoto, `alert at "${messages[firstAlertIndex(messages)]?.text}"`);

      const a = assessConversation(messages);
      assert.equal(a.stage, 'coercion');
      assert.ok(a.score >= 80, `score ${a.score}`);
      assert.deepEqual(a.stagesReached, ['trust', 'isolation', 'probing', 'image_request', 'coercion']);
      assert.equal(a.alertCategory, 'SEXTORTION_THREAT');
      // Timeline: below the alert threshold before the photo request, never decreasing inside the window.
      for (let i = 0; i < firstPhoto; i += 1) assert.ok(a.perMessage[i]!.score < 50, `msg ${i + 1}: ${a.perMessage[i]!.score}`);
      for (let i = 1; i < a.perMessage.length; i += 1) assert.ok(a.perMessage[i]!.score >= a.perMessage[i - 1]!.score);
      assert.equal(a.perMessage[firstPhoto]!.stage, 'image_request');
      assert.equal(a.perMessage.at(-1)!.stage, 'coercion');
      assert.ok(a.explanation.en.includes('step by step'));
    });

    test(`meeting-request [${lang}]: alert at "come alone", category MEETING_REQUEST`, () => {
      const s = KIDS_SCENARIOS.find((x) => x.id === 'meeting-request')!;
      const messages = toChatMessages(s, lang);
      const idx = firstAlertIndex(messages);
      assert.ok(messageSignals(messages[idx]!).some((x) => x.type === 'MEETING_REQUEST'));
      assert.equal(assessConversation(messages).alertCategory, 'MEETING_REQUEST');
    });
  }

  test('indicator evidence points at the source message text', () => {
    for (const s of KIDS_SCENARIOS) {
      for (const m of toChatMessages(s, 'az')) {
        for (const sig of messageSignals(m)) assert.equal(m.text.slice(sig.span.start, sig.span.end), sig.evidence);
      }
    }
  });
});

describe('grooming engine: rules', () => {
  const grooming = [
    "You're so mature for your age. Only I understand you.",
    "Don't tell your parents. Let's talk on Snapchat, it's more private.",
    'How old are you? Are you home alone?',
    'Send me a photo of you.',
    "If you don't send it, I'll share your photos with your friends.",
  ];

  test('child messages never create indicators', () => {
    const asChild = grooming.map((text, i) => msg(`c${i}`, 'child', text, i + 1));
    const a = assessConversation(asChild);
    assert.equal(a.score, 0);
    assert.deepEqual(a.indicators, []);
    assert.equal(a.shouldAlert, false);
    assert.equal(a.stage, 'none');
    assert.ok(a.perMessage.every((p) => p.types.length === 0 && p.stage === 'none'));
    assert.deepEqual(messageSignals(asChild[3]!), []);

    // The child repeating the contact's words adds nothing.
    const mixed = [msg('1', 'contact', 'Hi, how was school?', 1), msg('2', 'child', 'Someone said "send me a photo of you", weird.', 1)];
    assert.equal(assessConversation(mixed).score, 0);
  });

  test('messages outside the window are ignored', () => {
    const messages = [
      msg('old', 'contact', "If you don't send it, I'll share your photos with your friends.", 1),
      msg('new1', 'contact', 'Good game! See you tomorrow.', 40),
      msg('new2', 'contact', 'Same time tomorrow?', 41),
    ];
    const a = assessConversation(messages);
    assert.equal(a.score, 0);
    assert.deepEqual(a.indicators, []);
    assert.equal(a.shouldAlert, false);
    // The timeline still shows the threat at the time it was sent.
    assert.ok(a.perMessage[0]!.score >= 80);

    const wide = assessConversation(messages, { windowDays: 60 });
    assert.ok(wide.score >= 80 && wide.shouldAlert);

    // An explicit `now` excludes messages after it.
    const early = assessConversation(
      [msg('a', 'contact', 'Good game!', 1), msg('b', 'contact', 'Send me a photo of you.', 5)],
      { now: new Date(T0 + 2 * DAY).toISOString() },
    );
    assert.equal(early.shouldAlert, false);
    assert.deepEqual(early.indicators, []);
  });

  test('a homework photo request is not flagged (EN + AZ)', () => {
    for (const text of [
      'Can you send a photo of the math homework page?',
      'Riyaziyyat ev tapşırığı səhifəsinin şəklini ata bilərsən?',
    ]) {
      const m = msg('h', 'contact', text, 1);
      assert.deepEqual(messageSignals(m), [], text);
      const a = assessConversation([m]);
      assert.equal(a.shouldAlert, false);
      assert.equal(a.score, 0);
    }
  });

  test('generic threat words only mean coercion after a photo request', () => {
    const football = [
      msg('1', 'contact', "You're special, best striker on the team.", 1),
      msg('2', 'contact', 'That penalty was unfair lol.', 2),
    ];
    const a = assessConversation(football);
    assert.notEqual(a.stage, 'coercion');
    assert.ok(a.score < 50 && !a.shouldAlert, `score ${a.score}`);

    const extortion = [
      msg('1', 'contact', 'Send me a photo of you.', 1),
      msg('2', 'contact', 'Tell anyone and you will be arrested.', 2),
    ];
    const b = assessConversation(extortion);
    assert.equal(b.stage, 'coercion');
    assert.ok(b.score >= 80);
  });

  test('early signals alone stay below the alert threshold', () => {
    const a = assessConversation(grooming.slice(0, 3).map((text, i) => msg(`m${i}`, 'contact', text, (i + 1) * 5)));
    assert.equal(a.shouldAlert, false);
    assert.ok(a.score < 50, `score ${a.score}`);
    assert.equal(a.band, 'moderate');
    assert.equal(a.stage, 'probing');
    assert.equal(a.alertCategory, 'PERSONAL_INFO_PROBE');
    assert.deepEqual(a.childTip.en.startsWith('This chat shows warning signs'), true);
  });

  test('progression bonus: trust/isolation followed later by a photo request', () => {
    const alone = assessConversation([msg('p', 'contact', 'Send me a photo of you.', 1)]);
    const after = assessConversation([
      msg('t', 'contact', "You're so mature for your age.", 1),
      msg('p', 'contact', 'Send me a photo of you.', 10),
    ]);
    // Alone: 41 points, raised to the alert floor of 50 by the unambiguous ("hard") request.
    // After: 10 (trust) + 41 (photo) + 15 (progression); only 2 stages → no multi-stage bonus.
    assert.equal(alone.score, 50);
    assert.equal(alone.band, 'high');
    assert.equal(after.score, 66);
    assert.ok(alone.shouldAlert && after.shouldAlert, 'a clear photo request is a hard trigger');
    assert.ok(alone.explanation.en.startsWith('A request that a child should never get'));
  });

  test('an alert always means band high or critical (never a "moderate" alert)', () => {
    for (const s of KIDS_SCENARIOS) {
      for (const lang of ['en', 'az'] as const) {
        const messages = toChatMessages(s, lang);
        for (let i = 1; i <= messages.length; i += 1) {
          const a = assessConversation(messages.slice(0, i));
          assert.equal(a.shouldAlert, a.band === 'high' || a.band === 'critical', `${s.id} [${lang}] @${i}: ${a.score}`);
        }
      }
    }
  });

  // Everyday family / teen messages: a single one never alerts a parent.
  const singleMessageNegatives = [
    "Let's make a special video for Mrs. Smith's birthday",
    "It's a private video, I can't open it",
    "let's join private ones",
    'Müəllim üçün xüsusi video hazırlayaq',
    'Yeni telefonunun şəklini at',
    'Ayaqqabının şəklini at',
    'Paltarın şəklini göndər',
    'Send a selfie from the trip!',
    "I'll wait for you outside your school at 3",
    'Məktəbin qarşısında səni gözləyəcəm',
    'Tək gələrsən, yoxsa qardaşınla?',
    "I'll send your photos to your parents tonight",
    "I'll post your pics on the school instagram",
    'Your parents will see your photos at the exhibition',
    'Senin şəkillərini valideynlərinə göndərəcəm',
  ];
  for (const text of singleMessageNegatives) {
    test(`one everyday message never alerts: ${text}`, () => {
      const a = assessConversation([msg('x', 'contact', text, 1)]);
      assert.equal(a.shouldAlert, false, `score ${a.score} ${a.band}: ${a.indicators.map((i) => `${i.type}:${i.confidence}`).join(' ')}`);
      assert.notEqual(a.stage, 'coercion');
      assert.ok(a.score < 50, `score ${a.score}`);
    });
  }

  test('"come alone or with your brother?" is a question, not a meeting demand', () => {
    assert.ok(!typesOf('Tək gələrsən, yoxsa qardaşınla?').includes('MEETING_REQUEST'));
    assert.ok(!typesOf('Will you come alone or with your brother?').includes('MEETING_REQUEST'));
    assert.ok(typesOf("Let's meet at the mall. Come alone.").includes('MEETING_REQUEST'));
  });

  test('an ambiguous request alerts only with grooming context', () => {
    const plain = assessConversation([msg('1', 'contact', 'Send me a selfie.', 1)]);
    assert.equal(plain.shouldAlert, false, `score ${plain.score}`);
    const withSecrecy = assessConversation([
      msg('1', 'contact', "Don't tell your parents we talk.", 1),
      msg('2', 'contact', 'Send me a selfie.', 3),
    ]);
    assert.ok(withSecrecy.shouldAlert && withSecrecy.score >= 50, `score ${withSecrecy.score}`);
    assert.equal(withSecrecy.alertCategory, 'PERSONAL_IMAGE_REQUEST');

    const school = assessConversation([msg('1', 'contact', "I'll wait for you outside your school at 3.", 1)]);
    assert.equal(school.shouldAlert, false);
    const secretSchool = assessConversation([
      msg('1', 'contact', "You're so mature for your age. It's our little secret.", 1),
      msg('2', 'contact', "I'll wait for you outside your school at 3.", 2),
    ]);
    assert.ok(secretSchool.shouldAlert, `score ${secretSchool.score}`);
    assert.equal(secretSchool.alertCategory, 'MEETING_REQUEST');
  });

  test('"your photos" statements become sextortion only after a photo request in the window', () => {
    const threat = "I'll post your pics on the school instagram.";
    const after = assessConversation([
      msg('1', 'contact', 'Send me a photo of you.', 1),
      msg('2', 'contact', threat, 3),
    ]);
    assert.equal(after.stage, 'coercion');
    assert.ok(after.score >= 80 && after.shouldAlert);
    assert.equal(after.alertCategory, 'SEXTORTION_THREAT');
    assert.deepEqual(after.perMessage[1]!.types, ['SEXTORTION_THREAT']);

    // The photo request fell out of the 30-day window → the statement alone is not a threat.
    const old = assessConversation([msg('1', 'contact', 'Send me a photo of you.', 1), msg('2', 'contact', threat, 45)]);
    assert.notEqual(old.stage, 'coercion');
    assert.equal(old.shouldAlert, false);

    // A coercive structure in the same message is enough on its own.
    const coerced = assessConversation([msg('1', 'contact', `Send me more or ${threat.toLowerCase()}`, 1)]);
    assert.ok(coerced.shouldAlert && coerced.stage === 'coercion', `${coerced.score} ${coerced.stage}`);
  });

  test('knownContact: a trusted relative\'s single photo request does not alert, a threat still does', () => {
    const grandma = [msg('1', 'contact', 'Send me a photo of you in the costume!', 1)];
    assert.ok(assessConversation(grandma).shouldAlert, 'unknown contact: hard trigger');
    const known = assessConversation(grandma, { knownContact: true });
    assert.equal(known.shouldAlert, false, `score ${known.score}`);
    assert.ok(known.score < 50);

    const threat = [msg('1', 'contact', "If you don't send more, I'll share your photos with your friends.", 1)];
    const knownThreat = assessConversation(threat, { knownContact: true });
    assert.ok(knownThreat.shouldAlert && knownThreat.band === 'critical');
  });

  test('empty and clean conversations', () => {
    const empty = assessConversation([]);
    assert.equal(empty.score, 0);
    assert.equal(empty.stage, 'none');
    assert.equal(empty.shouldAlert, false);
    assert.equal(empty.alertCategory, null);
    assert.deepEqual(empty.perMessage, []);

    const clean = assessConversation([msg('1', 'contact', 'Good game! Same time tomorrow?', 1)]);
    assert.ok(clean.explanation.en.includes('30 days') && clean.explanation.az.includes('30 gün'));
    assert.equal(clean.guardianActions.length, 1);
    assert.ok(!clean.childTip.en.startsWith('This chat shows warning signs'));
  });

  test('unparseable timestamps are kept; results are deterministic', () => {
    const messages: ChatMessage[] = [{ id: 'x', from: 'contact', text: 'Send me a photo of you.', at: 'not-a-date' }];
    const a = assessConversation(messages);
    assert.ok(a.shouldAlert);
    assert.deepEqual(assessConversation(messages), a);
  });

  test('guardian actions are deduplicated and include the general steps', () => {
    const s = KIDS_SCENARIOS.find((x) => x.id === 'grooming-28-days')!;
    const a = assessConversation(toChatMessages(s, 'en'));
    const ens = a.guardianActions.map((g) => g.en);
    assert.equal(new Set(ens).size, ens.length);
    assert.ok(ens.some((e) => e.startsWith('Do not blame')));
    assert.ok(ens.some((e) => e.startsWith('Keep the evidence')));
    assert.ok(ens.some((e) => e.startsWith('Report the account')));
    // The safeguarding basics come first, so a short list never hides them.
    assert.deepEqual(
      ens.slice(0, 3).map((e) => e.split(' ').slice(0, 2).join(' ')),
      ['Do not', 'Keep the', 'Report the'],
    );
    assert.ok(!ens.some((e) => e.includes('Scammers')), 'adult-scam wording is replaced in the kids context');
    assert.equal(
      a.childTip.en,
      "This chat shows warning signs. You don't have to reply or send anything. It's not your fault — talk to a parent or an adult you trust.",
    );
  });

  test('every serious assessment starts its guidance with "do not blame" (all scenarios, at the first alert)', () => {
    for (const s of KIDS_SCENARIOS.filter((x) => x.expected === 'alert')) {
      for (const lang of ['en', 'az'] as const) {
        const messages = toChatMessages(s, lang);
        const i = messages.findIndex((_, k) => assessConversation(messages.slice(0, k + 1)).shouldAlert);
        const a = assessConversation(messages.slice(0, i + 1));
        assert.ok(a.guardianActions.slice(0, 3).some((g) => g.en.startsWith('Do not blame')), `${s.id} [${lang}]`);
        assert.ok(a.guardianActions.slice(0, 3).some((g) => g.az.startsWith('Uşağınızı günahlandırmayın')), `${s.id} [${lang}]`);
      }
    }
  });

  test('alert priority: sextortion outranks a photo request, which outranks a meeting request', () => {
    assert.ok(alertPriorityRank('SEXTORTION_THREAT') < alertPriorityRank('PERSONAL_IMAGE_REQUEST'));
    assert.ok(alertPriorityRank('PERSONAL_IMAGE_REQUEST') < alertPriorityRank('MEETING_REQUEST'));
    assert.ok(alertPriorityRank('GIFT_GROOMING') < alertPriorityRank('OTP_REQUEST'));
    assert.equal(alertPriorityRank(null), alertPriorityRank('OTP_REQUEST'));
  });
});

describe('guardian guidance on the guardian\'s own phone', () => {
  test('child-safety alerts get static next steps: no blame, evidence, the category action, report', () => {
    for (const category of ['SEXTORTION_THREAT', 'PERSONAL_IMAGE_REQUEST', 'MEETING_REQUEST', 'SECRECY'] as IndicatorType[]) {
      const g = guardianAlertGuidance(category);
      assert.ok(g[0]!.en.startsWith('Do not blame') && g[0]!.az.length > 0, category);
      assert.ok(g[1]!.en.startsWith('Keep the evidence'), category);
      assert.ok(g.at(-1)!.en.startsWith('Report the account'), category);
      assert.equal(new Set(g.map((x) => x.en)).size, g.length, category);
      assert.ok(g.every((x) => x.en && x.az), category);
    }
    assert.ok(guardianAlertGuidance('SEXTORTION_THREAT').some((x) => x.en.startsWith('Do not pay')));
    assert.ok(!guardianAlertGuidance('SECRECY').some((x) => x.en.includes('bank')), 'kids wording, not adult-scam wording');
  });

  test('isChildSafetyAlert: DaCy Kids app alerts and child-safety categories', () => {
    assert.ok(isChildSafetyAlert({ category: 'SECRECY', source: 'app' }));
    assert.ok(isChildSafetyAlert({ category: 'SEXTORTION_THREAT', source: 'message' }));
    assert.ok(!isChildSafetyAlert({ category: 'OTP_REQUEST', source: 'call' }));
  });
});
