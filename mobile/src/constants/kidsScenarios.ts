/**
 * DaCy Kids demo conversations for the child-phone SIMULATOR (Expo Go cannot
 * read other apps; see the honesty note in the Kids screen). Every message is
 * available in English and Azerbaijani.
 *
 * Content rules: all text is deliberately NON-EXPLICIT — the scenarios show
 * the grooming mechanics (trust → secrecy → probing → photo request → threat)
 * without any sexual wording. Names are fictional.
 *
 * `expected` is what services/security/groomingEngine.ts must decide for the
 * whole conversation, in both languages; tests/groomingEngine.test.ts enforces
 * it (and, for 'grooming-28-days', that the first alert fires exactly at the
 * first photo request).
 */
import type { ChatMessage, Localized, MonitoredAppId, UiLanguage } from '@/types/security';

export interface KidsScenario {
  id: string;
  title: Localized;
  app: MonitoredAppId;
  contactName: string;
  expected: 'alert' | 'no_alert';
  messages: { day: number; time: string; from: 'contact' | 'child'; text: Localized }[];
}

export const KIDS_SCENARIOS: KidsScenario[] = [
  /* ---------------------------------------------------------------- */
  /* a) Classic grooming over four weeks                              */
  /* ---------------------------------------------------------------- */
  {
    id: 'grooming-28-days',
    title: { en: 'A “gaming friend” over 4 weeks', az: '4 həftəlik “oyun dostu”' },
    app: 'instagram',
    contactName: 'alex_gamer_17',
    expected: 'alert',
    messages: [
      {
        day: 1,
        time: '18:05',
        from: 'contact',
        text: {
          en: "Hey! Saw your gaming clip, you're really good. What game is that?",
          az: 'Salam! Oyun videonu gördüm, çox yaxşı oynayırsan. Bu hansı oyundur?',
        },
      },
      {
        day: 1,
        time: '18:12',
        from: 'child',
        text: { en: "Thanks! It's Roblox, I play every day.", az: 'Sağ ol! Roblox-dur, hər gün oynayıram.' },
      },
      {
        day: 3,
        time: '19:40',
        from: 'contact',
        text: { en: 'Cool, me too. We should play together sometime.', az: 'Əla, mən də oynayıram. Nə vaxtsa birlikdə oynayaq.' },
      },
      {
        day: 6,
        time: '20:15',
        from: 'contact',
        text: {
          en: "You're so mature for your age, way smarter than most people I know.",
          az: 'Yaşına görə çox yetkinsən, tanıdığım adamların çoxundan ağıllısan.',
        },
      },
      { day: 6, time: '20:18', from: 'child', text: { en: 'Haha, thanks.', az: 'Haha, sağ ol.' } },
      {
        day: 9,
        time: '21:02',
        from: 'contact',
        text: {
          en: "Honestly, only I understand you. You're special.",
          az: 'Düzü, səni ancaq mən başa düşürəm. Sən xüsusisən.',
        },
      },
      {
        day: 12,
        time: '17:30',
        from: 'contact',
        text: {
          en: "I'll buy you 800 Robux for the new skin, no problem.",
          az: 'Yeni skin üçün sənə 800 Robux alaram, problem deyil.',
        },
      },
      { day: 12, time: '17:33', from: 'child', text: { en: 'Really? Thank you!!', az: 'Doğrudan? Çox sağ ol!' } },
      {
        day: 14,
        time: '19:10',
        from: 'contact',
        text: {
          en: "Just don't tell your parents about the Robux, they wouldn't understand. It's our little secret.",
          az: 'Sadəcə Robux barədə valideynlərinə demə, onlar başa düşməz. Bu, bizim kiçik sirrimizdir.',
        },
      },
      {
        day: 16,
        time: '20:45',
        from: 'contact',
        text: {
          en: "Let's talk on Snapchat instead, it's more private.",
          az: 'Gəl Snapchat-a keçək, orada daha gizlidir.',
        },
      },
      {
        day: 18,
        time: '18:20',
        from: 'contact',
        text: {
          en: 'How old are you, by the way? Which school do you go to?',
          az: 'Yeri gəlmişkən, neçə yaşın var? Hansı məktəbdə oxuyursan?',
        },
      },
      { day: 18, time: '18:26', from: 'child', text: { en: "I'm 12.", az: '12 yaşım var.' } },
      {
        day: 20,
        time: '16:05',
        from: 'contact',
        text: {
          en: 'Are you home alone after school? When are your parents at work?',
          az: 'Dərsdən sonra evdə təksən? Valideynlərin nə vaxt evdə olmur?',
        },
      },
      {
        day: 21,
        time: '21:30',
        from: 'contact',
        text: {
          en: 'Send me a photo of you, I want to see what you look like.',
          az: 'Özünün şəklini göndər, necə göründüyünü görmək istəyirəm.',
        },
      },
      { day: 21, time: '21:41', from: 'child', text: { en: 'Why do you need it?', az: 'Nəyə lazımdır?' } },
      {
        day: 24,
        time: '22:10',
        from: 'contact',
        text: {
          en: 'A private one, just for me. You can delete it after.',
          az: 'Şəxsi bir şəkil olsun, ancaq mənim üçün. Sonra silərsən.',
        },
      },
      { day: 26, time: '19:55', from: 'child', text: { en: "No, I don't want to.", az: 'Yox, istəmirəm.' } },
      {
        day: 28,
        time: '22:40',
        from: 'contact',
        text: {
          en: "If you don't send it, I'll share your photos with all your friends and your school. Everyone will see.",
          az: 'Göndərməsən, şəkillərini bütün dostlarına və məktəbinə göndərəcəm. Hamı görəcək.',
        },
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  /* b) Classmates and homework — hard negative                       */
  /* ---------------------------------------------------------------- */
  {
    id: 'classmate-homework',
    title: { en: 'Classmates and homework', az: 'Sinif yoldaşı və ev tapşırığı' },
    app: 'whatsapp',
    contactName: 'Nigar (6B)',
    expected: 'no_alert',
    messages: [
      {
        day: 1,
        time: '17:00',
        from: 'contact',
        text: { en: 'Hey, did you finish the math homework?', az: 'Salam, riyaziyyat ev tapşırığını bitirdin?' },
      },
      {
        day: 1,
        time: '17:04',
        from: 'child',
        text: { en: "Almost, I'm stuck on exercise 5.", az: 'Az qalıb, 5-ci misalda ilişmişəm.' },
      },
      {
        day: 1,
        time: '17:06',
        from: 'contact',
        text: {
          en: 'Same. Can you send a photo of the math homework page? I left my book at school.',
          az: 'Mən də. Riyaziyyat ev tapşırığı səhifəsinin şəklini ata bilərsən? Kitabımı məktəbdə unutmuşam.',
        },
      },
      { day: 1, time: '17:07', from: 'child', text: { en: 'Sure, one sec.', az: 'Əlbəttə, bir dəqiqə.' } },
      {
        day: 1,
        time: '17:10',
        from: 'contact',
        text: { en: 'Thanks! See you tomorrow in class.', az: 'Sağ ol! Sabah dərsdə görüşərik.' },
      },
      {
        day: 2,
        time: '20:30',
        from: 'contact',
        text: {
          en: "Don't forget we have the science test on Friday.",
          az: 'Cümə günü fizikadan test olduğunu unutma.',
        },
      },
      { day: 2, time: '20:34', from: 'child', text: { en: 'Ugh, I know. Good luck!', az: 'Bilirəm, uğurlar!' } },
    ],
  },

  /* ---------------------------------------------------------------- */
  /* c) Ordinary game chat — no alert                                  */
  /* ---------------------------------------------------------------- */
  {
    id: 'gaming-teammate',
    title: { en: 'A teammate in a game', az: 'Oyunda komanda yoldaşı' },
    app: 'roblox',
    contactName: 'BlueFox_2014',
    expected: 'no_alert',
    messages: [
      {
        day: 1,
        time: '19:00',
        from: 'contact',
        text: { en: 'Good game! That last round was crazy.', az: 'Əla oyun idi! Son raund dəhşət idi.' },
      },
      { day: 1, time: '19:01', from: 'child', text: { en: 'Haha yes, we almost lost.', az: 'Haha, az qala uduzurduq.' } },
      {
        day: 1,
        time: '19:02',
        from: 'contact',
        text: { en: "You're a great teammate, seriously.", az: 'Sən əla komanda yoldaşısan, ciddi deyirəm.' },
      },
      { day: 1, time: '19:03', from: 'child', text: { en: 'Thanks, you too!', az: 'Sağ ol, sən də!' } },
      {
        day: 1,
        time: '19:05',
        from: 'contact',
        text: {
          en: "Same time tomorrow? I'll be online after dinner.",
          az: 'Sabah eyni vaxtda? Şam yeməyindən sonra onlayn olacam.',
        },
      },
      { day: 1, time: '19:06', from: 'child', text: { en: 'Sure, see you!', az: 'Olar, görüşərik!' } },
      {
        day: 1,
        time: '19:07',
        from: 'contact',
        text: {
          en: "Cool, I'll send you a friend request so we can play together.",
          az: 'Super, sənə dostluq sorğusu göndərəcəm ki, birlikdə oynayaq.',
        },
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  /* d) Fast escalation to a secret meeting                           */
  /* ---------------------------------------------------------------- */
  {
    id: 'meeting-request',
    title: { en: 'Invitation to a secret meeting', az: 'Gizli görüşə dəvət' },
    app: 'telegram',
    contactName: 'Murad',
    expected: 'alert',
    messages: [
      {
        day: 1,
        time: '18:30',
        from: 'contact',
        text: {
          en: "Hi! Your dance videos are amazing. You're so mature, not like other kids your age.",
          az: 'Salam! Rəqs videoların möhtəşəmdir. Sən çox yetkinsən, yaşıdların kimi deyilsən.',
        },
      },
      { day: 1, time: '18:35', from: 'child', text: { en: 'Thank you!', az: 'Çox sağ ol!' } },
      {
        day: 2,
        time: '20:10',
        from: 'contact',
        text: {
          en: "Honestly, you're special. I feel like only I understand you.",
          az: 'Düzü, sən xüsusisən. Elə bil səni ancaq mən başa düşürəm.',
        },
      },
      { day: 2, time: '20:12', from: 'child', text: { en: 'Haha, maybe.', az: 'Haha, bəlkə də.' } },
      {
        day: 4,
        time: '19:45',
        from: 'contact',
        text: {
          en: "Don't tell anyone we talk, okay? Others wouldn't get it.",
          az: 'Danışdığımızı heç kimə demə, yaxşı? Başqaları başa düşməz.',
        },
      },
      { day: 4, time: '19:47', from: 'child', text: { en: 'Okay.', az: 'Yaxşı.' } },
      {
        day: 5,
        time: '21:00',
        from: 'contact',
        text: {
          en: "Let's meet at the mall on Saturday. Come alone.",
          az: 'Şənbə günü ticarət mərkəzində görüşək. Tək gəl.',
        },
      },
      { day: 5, time: '21:04', from: 'child', text: { en: "I'll think about it.", az: 'Fikirləşərəm.' } },
    ],
  },
];

/** Day 1 of every scenario when no start date is given (fixed, so tests and demos are deterministic). */
export const KIDS_SCENARIO_DEFAULT_START = '2026-10-01T00:00:00.000Z';

/**
 * Turns a scenario into ChatMessages with ISO timestamps (UTC):
 * day 1 = the start date, `time` = HH:MM on that day.
 * Pass `start` (e.g. 28 days ago) to make a demo look recent.
 */
export function toChatMessages(
  scenario: KidsScenario,
  lang: UiLanguage,
  options: { start?: string } = {},
): ChatMessage[] {
  const parsed = Date.parse(options.start ?? KIDS_SCENARIO_DEFAULT_START);
  const base = new Date(Number.isFinite(parsed) ? parsed : Date.parse(KIDS_SCENARIO_DEFAULT_START));
  return scenario.messages.map((m, i) => {
    const [hh, mm] = m.time.split(':').map((n) => Number.parseInt(n, 10));
    const at = Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate() + (m.day - 1),
      Number.isFinite(hh) ? hh! : 0,
      Number.isFinite(mm) ? mm! : 0,
    );
    return { id: `${scenario.id}-${i + 1}`, from: m.from, text: m.text[lang], at: new Date(at).toISOString() };
  });
}
