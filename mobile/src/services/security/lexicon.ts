/**
 * Bilingual (English + Azerbaijani) rule lexicon for the deterministic risk
 * engine.
 *
 * ALL patterns run against FOLDED text (see textNormalize.foldText): lowercase,
 * ə→e, ı/İ→i, ş→s, ç→c, ğ→g, ö→o, ü→u, curly quotes → '. Azerbaijani words
 * are therefore written in folded spelling ("gonderin", "tecili", "hec kime").
 * Because folding is length-preserving, match indices are valid in the
 * original text. Patterns marked `onOriginal` run on the unfolded text
 * (used for case-sensitive acronyms such as "DİN").
 *
 * The engine runs every pattern once per clause (sentence, or part of a
 * sentence split at "but / amma / ancaq / lakin"), so `[^.!?]` guards are not
 * needed and matches never cross clause boundaries.
 *
 * Pattern kinds (used by the engine to resolve negation and quoting):
 *  - (none)    ordinary signal of `type`
 *  - neverAsk  institutional "we will never ask" → suppresses every request
 *              match in the same clause
 *  - advice    protective advice ("never share your code") → suppresses
 *              overlapping / mention-only request matches in the clause
 *  - warning   third-person scam description ("fraudsters pretend …") →
 *              suppresses all non-first-person signals in the clause
 *  - tellNeg   "don't tell X" — SECRECY by default, re-classified as
 *              PROTECTIVE_ADVICE when it is about codes/passwords/card data
 *              and no real request is made in the same clause
 *  - benign    hard-negative context for its `type` ("a photo of the homework
 *              page", "ev tapşırığının şəklini"): suppresses overlapping
 *              matches of the same type and never becomes an indicator itself
 *
 * `np` (noun phrase) marks mention-only request patterns ("SMS ilə gələn kod",
 * "CVV", "safe account", "AnyDesk"): they are suppressed by protective advice
 * anywhere in the same clause, not only when overlapping.
 *
 * `hard` marks unambiguous child-safety requests ("send me a photo of you",
 * "a private photo just for me", "come alone", "get in my car"): on their own
 * they are enough to alert a guardian. Every other child-safety request needs
 * more grooming context in the conversation first (see groomingEngine.ts).
 *
 * `bare` marks unconditional statements about sharing the child's photos ("I'll
 * send your photos to your parents", "your parents will see your photos"). A
 * coach or a relative says the same words, so they only count as a sextortion
 * threat with a coercive structure in the same message (COERCION_CONTEXT_RE or a
 * photo request), or after an earlier photo request in the conversation.
 *
 * Child-safety patterns (DaCy Kids) follow the same rules. Their example
 * phrases are deliberately NON-EXPLICIT: the engine looks for the grooming
 * mechanics (trust → isolation → probing → photo request → threats), never for
 * sexual vocabulary.
 */
import type { IndicatorType } from '@/types/security';

export type LexiconIndicatorType = Exclude<IndicatorType, 'SUSPICIOUS_URL'>;
export type PatternKind = 'neverAsk' | 'advice' | 'warning' | 'tellNeg' | 'benign';

export interface LexiconPattern {
  /** Stable id for debugging / tests. */
  id: string;
  type: LexiconIndicatorType;
  /** Base confidence 0.5–0.95. */
  confidence: number;
  /** Global regex against folded text (or the original text when `onOriginal`). */
  re: RegExp;
  lang: 'en' | 'az' | 'any';
  kind?: PatternKind;
  /** Mention-only request (see header). */
  np?: boolean;
  /** Unambiguous child-safety request: alerts on its own (see header). */
  hard?: boolean;
  /** Unconditional photo-sharing statement: a threat only in a coercive context (see header). */
  bare?: boolean;
  onOriginal?: boolean;
}

/**
 * Child-safety requests (DaCy Kids). They count as requests for scoring (no
 * psychological-only cap, protective advice does not offset them), but an
 * institutional "we will never ask" never neutralises them: "I would never ask
 * you for anything bad" is a manipulation line, not a bank disclaimer.
 */
export const CHILD_REQUEST_TYPES: readonly IndicatorType[] = [
  'PERSONAL_IMAGE_REQUEST',
  'MEETING_REQUEST',
  'SEXTORTION_THREAT',
];

/** Request types: something is asked from the victim. */
export const REQUEST_TYPES: readonly IndicatorType[] = [
  'OTP_REQUEST',
  'CARD_DATA_REQUEST',
  'CREDENTIAL_REQUEST',
  'REMOTE_ACCESS_REQUEST',
  'SAFE_ACCOUNT_TRANSFER',
  'MONEY_TRANSFER_REQUEST',
  'UPFRONT_FEE',
  ...CHILD_REQUEST_TYPES,
];

/** First-person object inside a request ("tell ME the code", "MƏNƏ deyin"). */
export const DIRECT_OBJECT_RE = /\b(?:me|us|mene|bize)\b/;

/** Sensitive objects that turn "don't tell anyone" into protective advice. */
export const SENSITIVE_OBJECT_RE =
  /\b(?:codes?|otp|pin|passcode|passwords?|cvv2?|cvc2?|card\s+(?:number|details|data)|login|credentials|kod\w*|sifre\w*|parol\w*|cvv\w*|cvc\w*|kart\w*\s+(?:nomre|melumat|rekvizit)\w*)\b/;

/** Clause separators besides sentence punctuation (contrast conjunctions). */
export const CLAUSE_SPLIT_RE = /[.!?…]+(?=\s|$)|[;\n\r]+|\s(?=(?:but|however|amma|ancaq|lakin|feqet)\b)/g;

const p = (
  id: string,
  type: LexiconIndicatorType,
  confidence: number,
  lang: LexiconPattern['lang'],
  re: RegExp,
  extra: Partial<Pick<LexiconPattern, 'kind' | 'np' | 'hard' | 'bare' | 'onOriginal'>> = {},
): LexiconPattern => ({ id, type, confidence, lang, re, ...extra });

/* Shared fragments ------------------------------------------------------ */

// Amount with a currency, e.g. "500 azn", "₼ 20", "$200", "1.85 manat".
const AMOUNT = String.raw`(?:\d[\d\s.,]*\s*(?:azn|manat|man|₼|\$|usd|eur|euros?|dollars?|€|rub|rubles?)|(?:azn|₼|\$|€|usd|eur)\s*\d[\d.,]*)`;
const AZ_AMOUNT = String.raw`\d[\d.,]*\s*(?:azn|manat|man|₼|dollar|usd|eur|avro)\S*`;
// Positive Azerbaijani request verbs (imperatives) used to temper "advice" gaps.
const AZ_REQ_VERBS = String.raw`gonder|gonderin|de|deyin|yaz|yazin|oxu|oxuyun|soyle|soyleyin|ver|verin|bildir|bildirin`;
// Words that end a negation's scope in English ("don't tell anyone, JUST send …").
const EN_SCOPE_BREAK = String.raw`just|only|but|instead|then|now|please|so`;
// Positive Azerbaijani transfer verbs; negative forms (göndərməyin, köçürmə, yatırmayın …) are excluded,
// obligation forms (köçürməlisiniz) are kept. Bare "at" (throw/send) is NOT here: it collides with English "at".
const AZ_SEND = String.raw`gonder(?!me(?:y|z|sin)|me\b)\w*|kocur(?!me(?:y|z|sin)|me\b)\w*|atin|atarsan|atarsiz|atarsiniz|yatir(?!ma(?:y|z|sin)|ma\b)\w*`;

/* Child-safety fragments (DaCy Kids) ------------------------------------ */

// Image nouns.
const EN_IMG = String.raw`(?:photos?|pics?|pictures?|selfies?|videos?|vids?|snaps?|images?)`;
const AZ_IMG = String.raw`(?:sek(?:i)?l\w*|foto\w*|selfi\w*|video\w*)`;
// "your photo(s)" in the accusative (şəklini, şəkillərini, fotonu, videonu …) — the object of a request or threat.
const AZ_IMG_ACC = String.raw`(?:sek(?:i)?l(?:ler)?ini|foto(?:lar)?(?:ini|nu)|video(?:lar)?(?:ini|nu)|selfi(?:ler)?(?:ini|ni)|yazisma(?:lar)?(?:imizi|ini|ni)|mesaj(?:lar)?(?:imizi|ini))`;
// Positive request verbs after an AZ image noun ("şəklini AT", "özünün şəklini GÖNDƏR").
// Exact forms + \b, so negatives (göndərmə, atma) never match. Bare "at" only follows an AZ noun.
const AZ_IMG_VERB = String.raw`(?:gonder|gonderin|gondersene|gonderersen|gondere\s+bilersen|at|atin|atsana|atarsan|ata\s+bilersen|goster|gostersene|gosterersen|gostere\s+bilersen|cek|cekib\s+(?:at|gonder)|isteyirem|istiyirem)`;
// English sextortion building blocks.
const EN_I_WILL = String.raw`(?:i'll|i\s+will|ill|i'm\s+going\s+to|i\s+am\s+going\s+to|i'm\s+gonna|im\s+gonna)`;
const EN_IF_NOT = String.raw`\bif\s+(?:you|u)\s+(?:don't|dont|do\s+not|won't|wont|will\s+not|refuse|stop|block|ignore|tell)\b,?`;
const EN_THREAT_VERB = String.raw`(?:share|post|send|show|leak|upload|forward|spread|publish|put)`;
const EN_AUDIENCE = String.raw`(?:(?:to|with|on)\s+(?:all\s+(?:of\s+)?)?(?:your\s+|ur\s+|the\s+)?(?:whole\s+)?(?:friends|family|parents|mom|mum|dad|school|class|classmates|followers|teachers?|contacts|internet|instagram|tiktok|everyone|everybody)|online|everywhere)`;
// Azerbaijani sextortion building blocks: conditional ("if you don't send"), audience, 1sg future threat verb.
const AZ_COND = String.raw`(?:gondermesen|atmasan|odemesen|vermesen|razilasmasan|razi\s+olmasan|qulaq\s+asmasan|etmesen|elemesen|desen|danissan|bloklasan|sikayet\s+etsen)`;
const AZ_AUDIENCE = String.raw`(?:butun\s+)?(?:dost\w*|aile\w*|valideyn\w*|anana|atana|mekteb\w*|sinf\w*|sinif\w*|hamiya|hamisina|herkese|instagram\w*|internet\w*|izleyici\w*)`;
const AZ_THREAT_FUT = String.raw`(?:gonder(?:ecem|eceyem|ecegem|erem)|paylas(?:acam|acagam|aram)|yay(?:acam|acagam|aram)|yayimla(?:yacam|yacagam)|qoy(?:acam|acagam|aram)|at(?:acam|acagam)|goster(?:ecem|eceyem|erem)|yolla(?:yacam|yacagam))`;
const AZ_SEES = String.raw`(?:hami|hamisi|herkes|butun\s+dostlarin|dostlarin|valideynlerin|ailen|anan|atan|butun\s+mekteb|sinif\s+yoldaslarin)`;
// Objects that make a photo request ordinary (homework page, notes, the cat, the trip …).
const EN_BENIGN_PHOTO_OBJ = String.raw`(?:homework|notes?|page|pages|worksheet|assignment|task|exercises?|book|textbook|board|whiteboard|test|exam|schedule|timetable|answers?|questions?|project|poster|slides?|cat|dog|pet|puppy|kitten|hamster|trip|holiday|vacation|cake|food|lunch|dinner|meal|map|recipe|game|score|scores|team|match|drawing|painting|view|garden|sunset|sky|tree)`;
const AZ_BENIGN_PHOTO_OBJ = String.raw`(?:tapsirig\w*|ders\w*|defter\w*|konspekt\w*|qeyd\w*|sehife\w*|kitab\w*|cedvel\w*|misal\w*|mesele\w*|test\w*|imtahan\w*|cavablar\w*|suallar\w*|layihe\w*|lovhe\w*|taxta\w*|pisiy\w*|pisik\w*|itin|itimin|menzere\w*|sefer\w*|gezinti\w*|tort\w*|yemey\w*|yemek\w*|xerite\w*|resm\w*|sinif\w*|oyun\w*|komanda\w*)`;

const rx = (source: string): RegExp => new RegExp(source, 'g');

/**
 * Coercive structure anywhere in a message (folded text): a condition ("if you
 * don't…", "göndərməsən"), an ultimatum ("or else", "unless you", "yoxsa",
 * "əks halda") or a demand ("send more", "pay me", "daha çox göndər"). `bare`
 * photo-sharing statements only become a sextortion threat with it (see header).
 * Not global: used with .test().
 */
export const COERCION_CONTEXT_RE = new RegExp(
  [
    EN_IF_NOT,
    String.raw`\bunless\s+(?:you|u)\b`,
    String.raw`\bor\s+(?:else|i'll|i\s+will|ill)\b`,
    String.raw`\b(?:send|give)\s+(?:me\s+|us\s+)?(?:more|another|one\s+more|again)\b`,
    String.raw`\bpay\s+(?:me|us|up|now|\d)`,
    String.raw`\blast\s+chance\b`,
    String.raw`\b${AZ_COND}\b`,
    String.raw`\byoxsa\b`,
    String.raw`\beks\s+halda\b`,
    String.raw`\bdaha\s+(?:cox\s+|bir\s+)?(?:\S+\s+)?(?:gonder|at)(?:in|sana|sene)?\b`,
    String.raw`\bode(?:yin|\b)`,
    String.raw`\bson\s+sansin\b`,
  ].join('|'),
);

/**
 * Parent or family member as the target of "don't tell …" ("your mom",
 * "valideynlərinə", "anana"). Real protective advice says "anyone" / "heç kimə";
 * hiding something from the child's own family is grooming secrecy, even when the
 * clause mentions a code (gift-card and Robux codes are a typical grooming gift).
 * Not global: used with .test() on the "don't tell" match itself.
 */
export const FAMILY_TARGET_RE =
  /\b(?:dad|daddy|mom|mommy|mum|mummy|father|mother|grandma|grandpa|grandmother|grandfather|granny|parents?|family|folks|brother|sister|relatives|atama|atana|ataya|anama|anana|anaya|mamana|papana|nenene|babana|aile\w*|valideyn\w*|evdekiler\w*|qardas\w*|baci\w*)\b/;

export const LEXICON: readonly LexiconPattern[] = [
  /* ---------------------------------------------------------------- */
  /* OTP_REQUEST — only when the code is REQUESTED from the reader     */
  /* ---------------------------------------------------------------- */
  p('otp.en.direct', 'OTP_REQUEST', 0.92, 'en',
    /\b(?:tell|send|give|read|text|forward|dictate|say|share|provide|message)\s+(?:it\s+|them\s+)?(?:to\s+)?(?:me|us)\b(?:\s+\S+){0,6}?\s+(?:codes?|otp|passcode|one[- ]time\s+password|digits)\b/g),
  p('otp.en.received', 'OTP_REQUEST', 0.9, 'en',
    /\b(?:tell|send|give|read|text|forward|dictate|say|share|provide|confirm)\s+(?:me\s+|us\s+)?(?:the|your|that|this)\s+(?:[\w-]+\s+){0,2}?(?:code|otp|passcode)\s+(?:that\s+|which\s+)?(?:you\s+|we\s+)?(?:have\s+|has\s+)?(?:just\s+)?(?:got|get|received|receive|will\s+receive|sent|came|come|arrived|arrives|comes)\b/g),
  p('otp.en.fromSms', 'OTP_REQUEST', 0.85, 'en',
    /\b(?:tell|send|give|read|dictate|say|share|forward|provide|need|want)\b(?:\s+\S+){0,5}?\s+(?:codes?|otp|digits|numbers|password)\s+(?:from|in)\s+(?:the\s+|your\s+|that\s+|this\s+)?(?:sms|text|message)\b/g),
  p('otp.en.reply', 'OTP_REQUEST', 0.88, 'en',
    /\breply\s+(?:to\s+this\s+(?:message|sms)\s+)?with\s+(?:the|your|this)\s+(?:[\w-]+\s+){0,2}?(?:code|otp)\b/g),
  p('otp.en.what', 'OTP_REQUEST', 0.8, 'en', /\bwhat(?:'s|\s+is)\s+the\s+(?:[\w-]+\s+){0,2}?(?:code|otp)\b/g),
  p('otp.en.enterOnLink', 'OTP_REQUEST', 0.75, 'en',
    /\b(?:enter|type|input)\s+(?:the|your|this)\s+(?:[\w-]+\s+){0,2}?(?:code|otp)\s+(?:on|at|in|into)\s+(?:this|the\s+following|our)\s+(?:link|site|website|page|form)\b/g),
  p('otp.en.codeThenVerb', 'OTP_REQUEST', 0.85, 'en',
    /\b(?:code|otp)\s+(?:that\s+)?(?:you\s+)?(?:just\s+)?(?:got|received|came)\b(?:\s+\S+){0,4}?\s+(?:tell|send|give|read|dictate)\s+(?:it\s+)?(?:to\s+)?(?:me|us)\b/g),
  p('otp.az.verb', 'OTP_REQUEST', 0.92, 'az',
    /\b(?:kod|kodu|kodunu|kodlari|kodlarini|tesdiq\s+kodunu|sms\s*-?kodu)\b(?:\s+\S+){0,6}?\s+(?:mene\s+|bize\s+)?(?:deyin|de|gonderin|gonder|yazin|yaz|oxuyun|oxu|soyleyin|soyle|diqte\s+edin|diqte\s+et|bildirin|bildir|verin|ver)\b/g),
  p('otp.az.canYou', 'OTP_REQUEST', 0.85, 'az',
    /\bkod(?:u|unu)?\s+(?:\S+\s+){0,2}?(?:deye|gondere|yaza|oxuya|soyleye|diqte\s+ede)\s+bilersiniz\b/g),
  p('otp.az.what', 'OTP_REQUEST', 0.8, 'az', /\bkod(?:u)?\s+(?:nedir|necedir|nece\s+idi)\b/g),
  p('otp.az.toYou', 'OTP_REQUEST', 0.88, 'az',
    /\b(?:size|sizin|telefonunuza|nomrenize)\s+(?:\S+\s+){0,3}?gelen\s+(?:\S+\s+){0,2}?(?:kod|kodu|kodlari|sifre|sifreni|reqemleri)\b/g, { np: true }),
  p('otp.az.smsCode', 'OTP_REQUEST', 0.85, 'az',
    /\b(?:sms|mesaj)(?:-?(?:le|la|de|da|den|dan))?\s+(?:ile\s+)?gelen\s+(?:\S+\s+){0,2}?(?:kod|kodu|kodlari|sifre|sifreni|reqemleri)\b/g, { np: true }),

  /* ---------------------------------------------------------------- */
  /* CARD_DATA_REQUEST                                                 */
  /* ---------------------------------------------------------------- */
  p('card.en.verb', 'CARD_DATA_REQUEST', 0.92, 'en',
    /\b(?:send|tell|give|text|write|provide|share|enter|type|need|read|confirm|dictate|what\s+is|what's)\b(?:\s+\S+){0,8}?\s+(?:card\s+number|card\s+details|card\s+data|card\s+info\w*|cvv2?|cvc2?|expiry(?:\s+date)?|expiration(?:\s+date)?|valid\s+thru|pin(?:\s+code)?|(?:\d|three)\s+digits\s+on\s+the\s+back|numbers?\s+on\s+the\s+back|full\s+card)\b/g),
  p('card.en.mention', 'CARD_DATA_REQUEST', 0.75, 'en',
    /\b(?:cvv2?|cvc2?|(?:3|three)[-\s]digit\s+(?:code|number)\s+on\s+the\s+back|(?:3|three)\s+digits\s+on\s+the\s+back)\b/g, { np: true }),
  p('card.en.verifyCard', 'CARD_DATA_REQUEST', 0.8, 'en',
    /\b(?:verify|confirm|update|enter)\s+(?:your\s+)?(?:card|payment|billing)\s+(?:details|information|info|data)\b/g),
  p('card.az.verb', 'CARD_DATA_REQUEST', 0.92, 'az',
    /\b(?:kart\w*\s+(?:nomre\w*|melumat\w*|rekvizit\w*|uzerindeki\s+(?:\S+\s+){0,2}?reqem\w*|arxasindaki\s+(?:\S+\s+){0,2}?reqem\w*|son\s+istifade\s+tarix\w*|bitme\s+tarix\w*|pin\w*)|cvv\w*|cvc\w*|arxasindaki\s+(?:3|uc)\s+reqem\w*|(?:3|uc)\s+reqemli\s+kod\w*|son\s+istifade\s+tarix\w*|pin\s*-?kod\w*)(?:\s+\S+){0,8}?\s+(?:gonderin|gonder|deyin|de|yazin|yaz|oxuyun|oxu|verin|ver|bildirin|soyleyin|daxil\s+edin|lazimdir|lazim|teleb\s+olunur|qeyd\s+edin|tesdiqleyin)\b/g),
  p('card.az.toMe', 'CARD_DATA_REQUEST', 0.88, 'az',
    /\b(?:mene|bize)\s+(?:\S+\s+){0,2}?kart\w*\s+(?:nomre|melumat|rekvizit)\w*/g),
  p('card.az.mention', 'CARD_DATA_REQUEST', 0.75, 'az',
    /\b(?:cvv\w*|cvc\w*|arxasindaki\s+(?:3|uc)\s+reqem\w*|kart\w*\s+arxasindaki\s+(?:\S+\s+){0,2}?reqem\w*)/g, { np: true }),

  /* ---------------------------------------------------------------- */
  /* CREDENTIAL_REQUEST                                                */
  /* ---------------------------------------------------------------- */
  p('cred.en.verb', 'CREDENTIAL_REQUEST', 0.85, 'en',
    /\b(?:send|tell|give|share|confirm|provide|enter|type|need|verify|what\s+is|what's)\b(?:\s+\S+){0,6}?\s+(?:password|passcode|login\s+details|login\s+and\s+password|username\s+and\s+password|credentials|(?:online|internet|mobile)\s+banking\s+(?:login|password))\b/g),
  p('cred.en.verifyAccount', 'CREDENTIAL_REQUEST', 0.7, 'en',
    /\b(?:verify|confirm|update|re-?enter|validate)\s+(?:your\s+)?(?:account|login|banking|personal)\s+(?:details|information|info|data)\b|\b(?:verify|confirm|update)\s+your\s+(?:details|information|identity)\s+(?:at|on|via|here|using)\b/g),
  p('cred.en.loginLink', 'CREDENTIAL_REQUEST', 0.7, 'en',
    /\blog\s*-?in\s+(?:to\s+your\s+(?:account|online\s+banking)\s+)?(?:here|at|via|using\s+(?:this|the)\s+link)\b/g),
  p('cred.az.verb', 'CREDENTIAL_REQUEST', 0.85, 'az',
    /\b(?:sifre\w*|parol\w*|login\w*|istifadeci\s+adi\w*|giris\s+melumat\w*)(?:\s+\S+){0,6}?\s+(?:gonderin|gonder|deyin|de|yazin|yaz|oxuyun|verin|bildirin|soyleyin)\b/g),
  p('cred.az.verifyData', 'CREDENTIAL_REQUEST', 0.7, 'az',
    /\b(?:melumatlarinizi|hesab\s+melumat\w*|sexsi\s+melumat\w*|giris\s+melumat\w*)\s+(?:\S+\s+){0,4}?(?:tesdiqleyin|yenileyin|daxil\s+edin|gonderin)\b/g),

  /* ---------------------------------------------------------------- */
  /* REMOTE_ACCESS_REQUEST                                             */
  /* ---------------------------------------------------------------- */
  p('remote.any.install', 'REMOTE_ACCESS_REQUEST', 0.95, 'any',
    /\b(?:install|download|open|launch|yukle\w*|qurasdir\w*|endir\w*)\b(?:\s+\S+){0,5}?\s+(?:anydesk|any\s+desk|teamviewer|team\s+viewer|rustdesk|quicksupport|quick\s+support|supremo|ammyy|airdroid|ultraviewer)\b|\b(?:anydesk|teamviewer|rustdesk|quicksupport|supremo|airdroid|ultraviewer)\w*\s+(?:\S+\s+){0,2}?(?:yukle\w*|qurasdir\w*|endir\w*)/g),
  p('remote.any.brand', 'REMOTE_ACCESS_REQUEST', 0.9, 'any',
    /\b(?:anydesk|any\s+desk|teamviewer|team\s+viewer|rustdesk|quicksupport|quick\s+support|supremo|ammyy|airdroid|ultraviewer|rescue\s*assist|aeroadmin|getscreen)\b/g, { np: true }),
  p('remote.en.screen', 'REMOTE_ACCESS_REQUEST', 0.85, 'en',
    /\b(?:share|show|stream|cast|mirror)\s+(?:your|the)\s+(?:phone\s+|mobile\s+|device\s+)?screen\b|\b(?:turn\s+on|enable|start|allow)\s+(?:the\s+)?screen\s*-?\s*shar\w*|\b(?:give|grant)\s+(?:me|us)\s+(?:remote\s+)?access\s+to\s+your\b|\bremote\s+(?:access|control)\s+(?:to|of)\s+your\b/g),
  p('remote.az.screen', 'REMOTE_ACCESS_REQUEST', 0.85, 'az',
    /\bekran\w*\s+(?:\S+\s+){0,1}?(?:paylas(?!ma)\w*|goster(?!me)\w*|yayim\w*)|\bekran\s+paylasim\w*|\buzaqdan\s+(?:giris|idare|qosul)\w*/g),

  /* ---------------------------------------------------------------- */
  /* SAFE_ACCOUNT_TRANSFER                                             */
  /* ---------------------------------------------------------------- */
  p('safe.en.account', 'SAFE_ACCOUNT_TRANSFER', 0.9, 'en',
    /\b(?:safe|secure|secured|protected|reserve|backup|temporary|special|holding|trusted|insured)\s+(?:bank\s+)?account\b/g, { np: true }),
  p('safe.en.protectMoney', 'SAFE_ACCOUNT_TRANSFER', 0.8, 'en',
    /\bto\s+(?:protect|save|secure|keep)\s+(?:your\s+)?(?:money|savings|funds|deposits?)\b/g, { np: true }),
  p('safe.en.moveToProtect', 'SAFE_ACCOUNT_TRANSFER', 0.85, 'en',
    /\b(?:move|transfer|withdraw)\s+(?:all\s+)?(?:of\s+)?(?:your\s+|the\s+)?(?:money|savings|funds|deposit)\b(?:\s+\S+){0,6}?\s+(?:to\s+protect|for\s+safety|for\s+safekeeping|to\s+keep\s+it\s+safe)\b/g),
  p('safe.az.account', 'SAFE_ACCOUNT_TRANSFER', 0.9, 'az',
    /\b(?:tehlukesiz|ehtiyat|qorunan|muveqqeti|xususi|etibarli|sigortali|tranzit)\s+hesab\w*/g, { np: true }),
  p('safe.az.protectMoney', 'SAFE_ACCOUNT_TRANSFER', 0.8, 'az',
    /\b(?:pul\w*|emanet\w*|vesait\w*|yigim\w*|qenaet\w*)\s+(?:\S+\s+){0,1}?qorumaq\s+ucun\b/g, { np: true }),

  /* ---------------------------------------------------------------- */
  /* MONEY_TRANSFER_REQUEST                                            */
  /* ---------------------------------------------------------------- */
  p('money.en.amount', 'MONEY_TRANSFER_REQUEST', 0.9, 'en',
    rx(String.raw`\b(?:send|transfer|wire|deposit|top\s+up|lend|drop)\s+(?:me\s+|us\s+|him\s+|her\s+)?(?:the\s+|only\s+|just\s+)?${AMOUNT}`)),
  p('money.en.money', 'MONEY_TRANSFER_REQUEST', 0.85, 'en',
    /\b(?:send|transfer|wire|lend|move)\s+(?:me\s+|us\s+)?(?:some\s+|all\s+)?(?:of\s+)?(?:the\s+|your\s+)?(?:money|cash|funds|savings)\b/g),
  p('money.en.toCard', 'MONEY_TRANSFER_REQUEST', 0.8, 'en',
    /\b(?:send|transfer|wire|move)\s+(?:it|them|everything|this\s+amount)\b(?:\s+\S+){0,3}?\s+to\s+(?:this|my|the\s+following|a|an|our)\s+(?:\S+\s+){0,2}?(?:card|account|number|iban|wallet)\b/g),
  p('money.en.need', 'MONEY_TRANSFER_REQUEST', 0.75, 'en', rx(String.raw`\bneeds?\s+${AMOUNT}`)),
  p('money.en.deposit', 'MONEY_TRANSFER_REQUEST', 0.75, 'en',
    rx(String.raw`\b(?:minimum|initial|first)\s+deposit\s+(?:is\s+|of\s+)?(?:only\s+|just\s+)?${AMOUNT}`)),
  p('money.en.topUp', 'MONEY_TRANSFER_REQUEST', 0.75, 'en', /\btop\s+up\s+my\s+(?:card|phone|balance|account)\b/g),
  p('money.az.amountVerb', 'MONEY_TRANSFER_REQUEST', 0.9, 'az',
    rx(String.raw`\b${AZ_AMOUNT}\s+(?:\S+\s+){0,4}?(?:${AZ_SEND})\b`)),
  p('money.az.toCard', 'MONEY_TRANSFER_REQUEST', 0.9, 'az',
    rx(String.raw`\b(?:bu\s+karta|karta|kartima|bu\s+hesaba|hesabima|bu\s+nomreye|nomreme)\s+(?:\S+\s+){0,2}?(?:${AZ_SEND}|at|pul\s+at\w*)\b`)),
  p('money.az.money', 'MONEY_TRANSFER_REQUEST', 0.85, 'az',
    rx(String.raw`\b(?:pul|pulu|pulunuzu|pullarinizi|pulun|emanet\w*|vesait\w*|mebleg\w*)\b(?:\s+\S+){0,7}?\s+(?:${AZ_SEND})\b|\bpulu?\s+at\b`)),
  p('money.az.need', 'MONEY_TRANSFER_REQUEST', 0.75, 'az', rx(String.raw`\b${AZ_AMOUNT}\s+lazim\w*`)),
  p('money.az.deposit', 'MONEY_TRANSFER_REQUEST', 0.75, 'az',
    /\b(?:minimum|minimal|ilkin)\s+depozit\w*\s+(?:\S+\s+){0,2}?\d/g),
  p('money.az.lend', 'MONEY_TRANSFER_REQUEST', 0.7, 'az', /\bborc\s+ver(?!me)\w*/g),

  /* ---------------------------------------------------------------- */
  /* UPFRONT_FEE                                                       */
  /* ---------------------------------------------------------------- */
  p('fee.en.fee', 'UPFRONT_FEE', 0.85, 'en',
    /\b(?:delivery|shipping|customs|release|processing|handling|unlock(?:ing)?|activation|redelivery|re-delivery|clearance|storage|registration|insurance|verification|withdrawal)\s+(?:fee|charge|duty|duties|cost|tax)\b/g),
  p('fee.en.payOnly', 'UPFRONT_FEE', 0.8, 'en',
    /\bpay\s+(?:only|just|a\s+small\s+fee\s+of)\s+(?:\d|₼|\$|€)|\b(?:small|symbolic|one-time)\s+(?:fee|payment|charge)\b/g),
  p('fee.en.payFor', 'UPFRONT_FEE', 0.8, 'en',
    /\bpay\b(?:\s+\S+){0,4}?\s+for\s+(?:the\s+)?(?:delivery|shipping|customs|release|unlocking)\b/g),
  p('fee.en.toReceive', 'UPFRONT_FEE', 0.85, 'en',
    /\bto\s+(?:receive|claim|release|get|collect)\s+(?:your|the)\s+(?:parcel|package|prize|gift|reward|winnings|loan|money|order)\b(?:\s+\S+){0,6}?\s+pay\b/g),
  p('fee.az.fee', 'UPFRONT_FEE', 0.85, 'az',
    /\b(?:catdirilma|gomruk|aktivlesdirme|qeydiyyat|sigorta|blokdan\s+cixarma|resmilesdirme)\s+(?:haqq\w*|rusum\w*|odenis\w*)/g),
  p('fee.az.serviceFee', 'UPFRONT_FEE', 0.6, 'az', /\b(?:xidmet|komissiya|emeliyyat)\s+haqq\w*/g),
  p('fee.az.payOnly', 'UPFRONT_FEE', 0.8, 'az',
    rx(String.raw`\b(?:cemi|yalniz|sadece)\s+${AZ_AMOUNT}\s+(?:\S+\s+){0,1}?ode\w*`)),
  p('fee.az.small', 'UPFRONT_FEE', 0.8, 'az', /\b(?:kicik|simvolik|birdefelik)\s+(?:odenis|mebleg|haqq)\w*/g),
  p('fee.az.toReceive', 'UPFRONT_FEE', 0.8, 'az',
    /\b(?:baglama\w*|hediyye\w*|udus\w*|mukafat\w*|kredit\w*)\s+(?:\S+\s+){0,1}?almaq\s+ucun\b(?:\s+\S+){0,8}?\s+ode\w*/g),

  /* ---------------------------------------------------------------- */
  /* INVESTMENT_LURE                                                   */
  /* ---------------------------------------------------------------- */
  p('invest.en.guaranteed', 'INVESTMENT_LURE', 0.9, 'en',
    /\bguaranteed\s+(?:profits?|returns?|income|earnings|payouts?|win)\b/g),
  p('invest.en.percent', 'INVESTMENT_LURE', 0.85, 'en',
    /\b\d+(?:[.,]\d+)?\s*%\s*(?:profit\s+|return\s+|interest\s+)?(?:daily|weekly|monthly|per\s+(?:day|week|month)|a\s+(?:day|week|month)|every\s+(?:day|week|month))\b/g),
  p('invest.en.double', 'INVESTMENT_LURE', 0.8, 'en',
    /\b(?:double|triple|x2|x10)\s+your\s+(?:money|investment|deposit|crypto|bitcoin|usdt|savings)\b/g),
  p('invest.en.noRisk', 'INVESTMENT_LURE', 0.75, 'en',
    /\b(?:risk-?free|zero\s+risk|no\s+risk|without\s+(?:any\s+)?risk)\b/g),
  p('invest.en.crypto', 'INVESTMENT_LURE', 0.6, 'en',
    /\b(?:crypto|bitcoin|btc|usdt|forex|trading)\s+(?:bot|signals?|platform|investment|trader|scheme)\b|\bpassive\s+income\b/g),
  p('invest.en.earn', 'INVESTMENT_LURE', 0.8, 'en',
    /\bearn\s+(?:up\s+to\s+)?\d[\d.,]*\s*(?:azn|manat|₼|\$|usd|eur|€)?\s*(?:a|per|every)\s+(?:day|week)\b/g),
  p('invest.az.guaranteed', 'INVESTMENT_LURE', 0.9, 'az', /\bzemanetli\s+(?:gelir|qazanc|menfeet|udus)\w*/g),
  p('invest.az.percent', 'INVESTMENT_LURE', 0.85, 'az',
    /\b(?:gundelik|gunluk|heftelik|ayliq|her\s+gun|gunde|heftede|ayda)\s*\d+(?:[.,]\d+)?\s*(?:%|faiz)|\b\d+(?:[.,]\d+)?\s*(?:%|faiz)\s+(?:gundelik|heftelik|ayliq|gelir|qazanc|menfeet)\w*/g),
  p('invest.az.double', 'INVESTMENT_LURE', 0.8, 'az',
    /\b(?:pulunuzu|investisiyanizi|depozitinizi)\s+(?:\S+\s+){0,1}?(?:ikiqat|uc\s+qat|qat-qat)\w*|\bikiqat\s+(?:qazanc|gelir|artir)\w*/g),
  p('invest.az.noRisk', 'INVESTMENT_LURE', 0.75, 'az',
    /\b(?:risksiz|hec\s+bir\s+risk\s+(?:yoxdur|olmadan)|risk\s+olmadan|itki\s+riski\s+yoxdur)\b/g),
  p('invest.az.crypto', 'INVESTMENT_LURE', 0.6, 'az',
    /\b(?:kripto|bitkoin|bitcoin|forex)\s*(?:bot\w*|siqnal\w*|platforma\w*|investisiya\w*|treyder\w*)|\bpassiv\s+gelir\w*/g),

  /* ---------------------------------------------------------------- */
  /* PRIZE_LURE                                                        */
  /* ---------------------------------------------------------------- */
  p('prize.en.won', 'PRIZE_LURE', 0.85, 'en',
    /\b(?:you|your\s+(?:number|phone|card|account))\s+(?:have\s+|has\s+)?(?:won|been\s+selected|been\s+chosen)\b|\byou've\s+won\b|\byou\s+are\s+(?:the|our)\s+(?:lucky\s+)?winner\b/g),
  p('prize.en.claim', 'PRIZE_LURE', 0.85, 'en',
    /\b(?:claim|receive|collect|get)\s+your\s+(?:prize|gift|reward|winnings|bonus|iphone)\b/g),
  p('prize.en.lottery', 'PRIZE_LURE', 0.75, 'en',
    /\b(?:lottery|lucky\s+draw|prize\s+draw|giveaway|sweepstakes|jackpot)\b/g),
  p('prize.en.free', 'PRIZE_LURE', 0.75, 'en', /\bfree\s+(?:iphone|gift|prize|bonus)\b/g),
  p('prize.en.congrats', 'PRIZE_LURE', 0.5, 'en', /\bcongratulations?\b/g),
  p('prize.az.won', 'PRIZE_LURE', 0.85, 'az',
    /\b(?:qalib\s+(?:geldiniz|oldunuz|secildiniz|secilmisiniz)|(?:hediyye|bonus|udus|mukafat)\w*\s+qazandiniz|uddunuz|udmusunuz)\b|\b(?:nomreniz|siz|kartiniz)\s+(?:\S+\s+){0,5}?(?:qazandi|uddu)\b/g),
  p('prize.az.lottery', 'PRIZE_LURE', 0.75, 'az', /\b(?:lotereya\w*|udus\w*|tiraj\w*|cekilis\w*)/g),
  p('prize.az.toReceive', 'PRIZE_LURE', 0.8, 'az', /\b(?:hediyye\w*|udus\w*|mukafat\w*|bonus\w*)\s+almaq\s+ucun\b/g),
  p('prize.az.free', 'PRIZE_LURE', 0.75, 'az', /\bpulsuz\s+(?:iphone|hediyye|bonus)\w*/g),
  p('prize.az.congrats', 'PRIZE_LURE', 0.5, 'az', /\btebrik\s+edirik\b/g),

  /* ---------------------------------------------------------------- */
  /* URGENCY                                                           */
  /* ---------------------------------------------------------------- */
  p('urgency.en.urgent', 'URGENCY', 0.85, 'en',
    /\b(?:urgent|urgently|immediately|asap|as\s+soon\s+as\s+possible|right\s+away|without\s+delay)\b/g),
  p('urgency.en.within', 'URGENCY', 0.9, 'en',
    /\bwithin\s+(?:the\s+next\s+)?(?:\d+|one|two|three|five|ten|fifteen|thirty)\s*(?:minutes?|mins?|hours?|hrs?|h)\b/g),
  p('urgency.en.pressure', 'URGENCY', 0.75, 'en',
    /\b(?:right\s+now|hurry(?:\s+up)?|be\s+quick|act\s+now|now\s+or\s+never|last\s+chance|today\s+only|only\s+today|don't\s+(?:waste|lose)\s+time|no\s+time\s+to\s+(?:lose|waste|explain)|before\s+it's\s+too\s+late|before\s+midnight|time\s+is\s+running\s+out)\b/g),
  p('urgency.en.quickly', 'URGENCY', 0.6, 'en', /\bquickly\b/g),
  p('urgency.en.expires', 'URGENCY', 0.7, 'en',
    /\b(?:expires?|expiring|ends?)\s+(?:today|tonight|soon|in\s+\d+\s*(?:minutes?|hours?))\b/g),
  p('urgency.en.limited', 'URGENCY', 0.75, 'en',
    /\b(?:only\s+)?\d+\s+(?:places|spots|seats|slots)\s+(?:left|remaining)\b|\blimited\s+(?:places|spots|time\s+offer|offer)\b/g),
  p('urgency.az.urgent', 'URGENCY', 0.85, 'az', /\b(?:tecili|tecilen|derhal)\b/g),
  p('urgency.az.now', 'URGENCY', 0.75, 'az', /\b(?:ele\s+indi|bu\s+deqiqe)\b/g),
  p('urgency.az.within', 'URGENCY', 0.9, 'az',
    /\b(?:\d+|bir|iki|uc|bes|on|on\s+bes|otuz|yarim)\s*(?:deqiqe|saat|gun)\s+(?:erzinde|icinde|icerisinde)\b/g),
  p('urgency.az.pressure', 'URGENCY', 0.75, 'az',
    /\b(?:tez\s+(?:ol|olun|edin|et|bax|baxin|gonder\w*|deyin|de|yaz\w*|ode\w*|cavab\s+ver\w*)|telesin|gecikmeyin|vaxt\s+azdir|vaxt\s+itirmeyin|son\s+sans|yalniz\s+bu\s+gun|bu\s+gun\s+son\s+gun\w*|\d+\s+yer\s+qalib|yerler\s+mehduddur)\b/g),
  p('urgency.az.expires', 'URGENCY', 0.7, 'az', /\b(?:muddeti|vaxti)\s+(?:bu\s+gun|bu\s+gece|sabah|tezlikle)\s+bit\w*/g),

  /* ---------------------------------------------------------------- */
  /* AUTHORITY_IMPERSONATION                                           */
  /* ---------------------------------------------------------------- */
  p('authority.en.bankSecurity', 'AUTHORITY_IMPERSONATION', 0.9, 'en',
    /\b[a-z]*bank\S*\s+(?:cyber\s*-?\s*)?(?:security|cybersecurity|fraud|anti-?fraud|risk|monitoring)(?:\s+(?:department|service|team|division|unit|center|centre))?\b|\b(?:security|fraud|anti-?fraud)\s+(?:department|service|division|unit)\s+of\s+(?:the|your)\s+bank\b/g),
  p('authority.en.police', 'AUTHORITY_IMPERSONATION', 0.85, 'en',
    /\b(?:police|cyber\s*crime\s+(?:department|unit|police|division)|investigator|prosecutor(?:'s\s+office)?|ministry\s+of\s+(?:internal\s+affairs|interior)|interpol|state\s+security\s+service)\b/g),
  p('authority.en.tax', 'AUTHORITY_IMPERSONATION', 0.8, 'en',
    /\btax\s+(?:service|authority|office|department|inspector)\b/g),
  p('authority.en.customs', 'AUTHORITY_IMPERSONATION', 0.75, 'en', /\bcustoms\b/g),
  p('authority.en.centralBank', 'AUTHORITY_IMPERSONATION', 0.75, 'en', /\bcentral\s+bank\b/g),
  p('authority.en.court', 'AUTHORITY_IMPERSONATION', 0.75, 'en',
    /\b(?:court\s+(?:order|decision|case|hearing|bailiff)|by\s+(?:the\s+)?court|district\s+court|bailiff)\b/g),
  p('authority.en.rank', 'AUTHORITY_IMPERSONATION', 0.6, 'en',
    /\b(?:major|lieutenant|captain|detective|colonel)\s+[a-z]{3,}/g),
  p('authority.az.bankSecurity', 'AUTHORITY_IMPERSONATION', 0.9, 'az',
    /\b[a-z]*bank\S*\s+(?:kiber\s*)?(?:tehlukesizlik|kibertehlukesizlik|anti-?fraud|monitorinq|risk)\s+(?:sobe|xidmet|departament|bolme|merkez)\w*/g),
  p('authority.az.security', 'AUTHORITY_IMPERSONATION', 0.8, 'az', /\b(?:kiber\s*)?(?:kiber)?tehlukesizlik\s+(?:sobe|xidmet|departament)\w*/g),
  p('authority.az.police', 'AUTHORITY_IMPERSONATION', 0.85, 'az',
    /\b(?:polis(?:in|e|den|ler|lerin|idir)?|prokuror\w*|mustentiq\w*|kibercinayet\w*|cinayet\s+axtaris\w*|daxili\s+isler\s+nazirliy\w*|dovlet\s+tehlukesizlik\w*|merkezi\s+bank\w*)\b/g),
  p('authority.az.state', 'AUTHORITY_IMPERSONATION', 0.75, 'az',
    /\b(?:gomruk\w*|vergi\s+(?:xidmet|orqan|idare|mufettis)\w*|mehkeme\w*|icra\s+memur\w*)/g),
  p('authority.az.acronym', 'AUTHORITY_IMPERSONATION', 0.8, 'az', /\b(?:DİN|DIN|DTX)\b/g, { onOriginal: true }),
  p('authority.az.rank', 'AUTHORITY_IMPERSONATION', 0.6, 'az', /\b(?:mayor|leytenant|kapitan|polkovnik)\s+[a-z]{3,}/g),

  /* ---------------------------------------------------------------- */
  /* FAMILY_EMERGENCY                                                  */
  /* ---------------------------------------------------------------- */
  p('family.en.itsMe', 'FAMILY_EMERGENCY', 0.9, 'en',
    /\b(?:mom|mum|mommy|mummy|mother|dad|daddy|father|grandma|granny|grandpa|grandmother|grandfather)\W{0,3}\s*(?:it's|it\s+is|this\s+is)\s+(?:me|your\s+(?:son|daughter|grandson|granddaughter))\b/g),
  p('family.en.yourChild', 'FAMILY_EMERGENCY', 0.85, 'en',
    /\b(?:it's|it\s+is|this\s+is)\s+(?:me\W{0,3}\s*)?your\s+(?:son|daughter|grandson|granddaughter|child)\b/g),
  p('family.en.phone', 'FAMILY_EMERGENCY', 0.85, 'en',
    /\b(?:my\s+phone\s+(?:broke|is\s+broken|has\s+broken|died|is\s+dead|was\s+stolen|got\s+stolen|fell|is\s+not\s+working|isn't\s+working)|(?:broke|lost|dropped)\s+my\s+phone)\b/g),
  p('family.en.trouble', 'FAMILY_EMERGENCY', 0.85, 'en',
    /\b(?:i'm|i\s+am|i've\s+been|i\s+have\s+been|i\s+was|i\s+got)\s+(?:in\s+(?:big\s+|serious\s+|real\s+)?trouble|in\s+an?\s+(?:car\s+)?accident|in\s+(?:the\s+)?hospital|arrested|detained|at\s+the\s+police(?:\s+station)?)\b|\b(?:had|caused)\s+an?\s+(?:car\s+)?accident\b/g),
  p('family.az.itsMe', 'FAMILY_EMERGENCY', 0.9, 'az',
    /\b(?:ana|anacan|anam|mama|ata|atacan|atam|baba|nene|nenecan|qardas|baci)\W{0,3}\s*(?:menem|men\s+em)\b/g),
  p('family.az.yourChild', 'FAMILY_EMERGENCY', 0.85, 'az', /\bmenem\W{0,3}\s*(?:oglun|qizin|nevesin|neven)\w*/g),
  p('family.az.phone', 'FAMILY_EMERGENCY', 0.85, 'az',
    /\btelefonum\s+(?:\S+\s+){0,1}?(?:xarab|sinib|sindi|itib|itdi|ogurlan\w*|dusub|islemir|sonub|qirilib)\w*/g),
  p('family.az.trouble', 'FAMILY_EMERGENCY', 0.85, 'az',
    /\b(?:basim\s+(?:\S+\s+)?belaya\s+dusub|belaya\s+dusmusem|probleme?\s+dusmusem|qezaya\s+dusmusem|qeza\s+(?:etmisem|toretmisem)|polisdeyem|polise\s+dusmusem|meni\s+(?:saxlayiblar|tutublar)|xestexanadayam)\b/g),
  p('family.az.accident', 'FAMILY_EMERGENCY', 0.7, 'az', /\bqeza\w*/g),

  /* ---------------------------------------------------------------- */
  /* THREAT_OR_FEAR                                                    */
  /* ---------------------------------------------------------------- */
  p('threat.en.blocked', 'THREAT_OR_FEAR', 0.85, 'en',
    /\b(?:card|account|accounts|wallet|number|sim)\s+(?:has\s+been|have\s+been|is|was|will\s+be|may\s+be|is\s+being)\s+(?:temporarily\s+|permanently\s+)?(?:blocked|suspended|frozen|locked|closed|restricted|deactivated|compromised|hacked|disabled|terminated)\b/g),
  p('threat.en.legal', 'THREAT_OR_FEAR', 0.85, 'en',
    /\b(?:arrest(?:ed)?|warrant|criminal\s+(?:case|liability|charges?|proceedings)|prosecution|lawsuit|you\s+will\s+be\s+(?:sued|fined|charged|prosecuted)|fine\s+of|penalty|court\s+case)\b/g),
  p('threat.en.willBe', 'THREAT_OR_FEAR', 0.7, 'en',
    /\bwill\s+be\s+(?:blocked|suspended|deleted|destroyed|returned|frozen|cancelled|canceled|confiscated|closed)\b/g),
  p('threat.en.lose', 'THREAT_OR_FEAR', 0.75, 'en',
    /\b(?:you\s+will\s+lose|lose\s+(?:all\s+)?(?:your|the))\s+(?:all\s+)?(?:your\s+)?(?:money|savings|funds|account|data|access)\b/g),
  p('threat.en.someone', 'THREAT_OR_FEAR', 0.75, 'en',
    /\b(?:someone|somebody|criminals|fraudsters|hackers|scammers)\s+(?:is|are|has\s+been|have\s+been)\s+(?:trying\s+to\s+|now\s+)?(?:withdraw|steal|take|transfer|access|using|use|log)\w*/g),
  p('threat.en.suspicious', 'THREAT_OR_FEAR', 0.65, 'en',
    /\b(?:suspicious|unusual|unauthori[sz]ed)\s+(?:activity|transactions?|login|log-in|sign-in|operation|payment|access)\b/g),
  p('threat.en.loan', 'THREAT_OR_FEAR', 0.75, 'en',
    /\b(?:loan|credit)\s+(?:in|on|under)\s+your\s+name\b/g),
  p('threat.az.blocked', 'THREAT_OR_FEAR', 0.85, 'az',
    /\b(?:bloklan|dondurul)(?:ib|acaq|di|mis|ir|ar|masi|ma)\w*|\b(?:kart|hesab)\w*\s+(?:\S+\s+){0,2}?baglan(?:ib|acaq|di|mis)\w*/g),
  p('threat.az.legal', 'THREAT_OR_FEAR', 0.85, 'az',
    /\b(?:hebs\w*|cerime\w*|cinayet\s+is\w*|cinayet\s+mesuliyyet\w*|mesuliyyete\s+celb\w*|mehkemeye\s+veril\w*|axtarisa\s+veril\w*)/g),
  p('threat.az.lose', 'THREAT_OR_FEAR', 0.75, 'az',
    /\b(?:pul\w*|vesait\w*|emanet\w*)\s+(?:\S+\s+){0,2}?(?:itirecek\w*|itecek|itirersiniz|yox\s+olacaq)|\b(?:itireceksiniz|itirersiniz)\b/g),
  p('threat.az.trying', 'THREAT_OR_FEAR', 0.75, 'az',
    /\b(?:cixarmaga|ogurlamaga|kocurmeye|daxil\s+olmaga|goturmeye)\s+calis\w*/g),
  p('threat.az.loan', 'THREAT_OR_FEAR', 0.75, 'az', /\badiniza\s+(?:kredit|borc)\w*/g),
  p('threat.az.suspicious', 'THREAT_OR_FEAR', 0.65, 'az',
    /\b(?:subheli|icazesiz|qeyri-adi)\s+(?:emeliyyat|giris|fealiyyet|odenis|cehd)\w*/g),
  p('threat.az.criminals', 'THREAT_OR_FEAR', 0.75, 'az',
    /\b(?:cinayetkar|deleduz|haker|firildaqci)\w*\s+(?:\S+\s+){0,2}?(?:istifade\s+edir|daxil\s+olub|ele\s+kecir\w*)/g),
  p('threat.az.willBe', 'THREAT_OR_FEAR', 0.65, 'az',
    /\b(?:silinecek|legv\s+edilecek|qaytarilacaq|mehv\s+edilecek|musadire\s+olunacaq)\b/g),

  /* ---------------------------------------------------------------- */
  /* NEW_CONTACT_CHANNEL                                               */
  /* ---------------------------------------------------------------- */
  p('contact.en.newNumber', 'NEW_CONTACT_CHANNEL', 0.85, 'en',
    /\b(?:this\s+is\s+my\s+new\s+number|it's\s+my\s+new\s+number|my\s+new\s+number|save\s+(?:this|my\s+new)\s+number|i\s+have\s+a\s+new\s+number|changed\s+my\s+number)\b/g),
  p('contact.en.app', 'NEW_CONTACT_CHANNEL', 0.8, 'en',
    /\b(?:write|text|message|contact|add|call|find)\s+(?:to\s+)?me\s+(?:on|via|in|at)\s+(?:whatsapp|telegram|viber|signal|wechat)\b|\b(?:continue|move|switch|chat)\s+(?:on|to|in)\s+(?:whatsapp|telegram|viber|signal)\b/g),
  p('contact.en.friendPhone', 'NEW_CONTACT_CHANNEL', 0.8, 'en',
    /\b(?:from|on)\s+(?:a|my)\s+friend's\s+(?:phone|number)\b|\bborrowed\s+(?:a|my\s+friend's|someone's)\s+phone\b/g),
  p('contact.az.newNumber', 'NEW_CONTACT_CHANNEL', 0.85, 'az',
    /\b(?:yeni\s+nomrem\w*|bu\s+(?:menim\s+)?yeni\s+nomre\w*|bu\s+nomreni\s+yadda\s+saxla\w*|nomremi\s+deyismisem|nomremi\s+deyisdim)/g),
  p('contact.az.app', 'NEW_CONTACT_CHANNEL', 0.8, 'az',
    /\b(?:whatsapp|vatsap|votsap|telegram|teleqram|viber|signal)\S*\s+(?:\S+\s+){0,1}?(?:yaz|yazin|yazarsan|yazarsiniz|mesaj\s+(?:yaz|at|gonder)\w*|elave\s+et\w*)\b/g),
  p('contact.az.friendPhone', 'NEW_CONTACT_CHANNEL', 0.8, 'az', /\bdostumun\s+(?:telefon|nomre)\w*/g),
  // Grooming: move the chat to a "more private" app.
  p('contact.en.private', 'NEW_CONTACT_CHANNEL', 0.8, 'en',
    /\b(?:let's|lets|let\s+us|we\s+(?:can|should|could)|can\s+we|why\s+don't\s+we)\s+(?:talk|chat|text|continue|move|switch|go)\s+(?:\S+\s+)?(?:on|to|in|over|via)\s+(?:snap(?:chat)?|telegram|whatsapp|discord|kik|signal|viber|wickr|session|private\s+(?:chat|dms?))\b|\badd\s+me\s+on\s+(?:snap(?:chat)?|discord|kik|telegram|whatsapp|signal)\b/g),
  p('contact.en.morePrivate', 'NEW_CONTACT_CHANNEL', 0.6, 'en',
    /\b(?:it's|its|it\s+is|that's|thats|is)\s+(?:more|much\s+more|way\s+more)\s+(?:private|secret)\b|\b(?:no\s*one|nobody)\s+(?:can\s+)?(?:sees?|reads?|checks?)\s+(?:our\s+(?:chats?|messages)|there)\b|\bmessages\s+disappear\b/g),
  p('contact.az.private', 'NEW_CONTACT_CHANNEL', 0.8, 'az',
    /\b(?:snap(?:chat)?|snepcet|telegram|teleqram|whatsapp|vatsap|votsap|discord|diskord|signal|viber|kik)\S*\s+(?:\S+\s+)?(?:kec|kecek|keceq|kecin|kecerik|yazisaq|yazisariq|danisaq|danisariq|gel|gelek|elave\s+et\w*|qosul\w*)\b/g),
  p('contact.az.morePrivate', 'NEW_CONTACT_CHANNEL', 0.6, 'az',
    /\bdaha\s+(?:gizli|mexfi)\w*|\b(?:orada|orda)\s+(?:hec\s+kim|kimse)\s+(?:gormur|gormeyecek|oxumur|bilmeyecek)\b|\bmesajlar\s+silinir\b/g),

  /* ---------------------------------------------------------------- */
  /* SECRECY                                                           */
  /* ---------------------------------------------------------------- */
  p('secrecy.en.dontTell', 'SECRECY', 0.85, 'en',
    /\b(?:don't|do\s+not|dont|never)\s+tell\s+(?:anyone|anybody|no\s*one|dad|mom|mum|father|mother|grandma|grandpa|(?:your|the|my)\s+(?:family|parents|husband|wife|dad|mom|mum|father|mother|brother|sister|son|daughter|relatives|bank|bank\s+staff|bank\s+employees|manager|colleagues|friends|police)|them|him|her)\b/g,
    { kind: 'tellNeg' }),
  p('secrecy.en.secret', 'SECRECY', 0.85, 'en',
    /\b(?:keep\s+(?:this|it|our\s+conversation)\s+(?:a\s+)?(?:secret|between\s+us|confidential|private)|between\s+you\s+and\s+me|it's\s+a\s+secret|(?:secret|confidential|classified)\s+(?:operation|investigation|case)|(?:nobody|no\s+one)\s+(?:should|must|can)\s+know|without\s+telling\s+(?:anyone|your)|do\s+not\s+discuss|don't\s+discuss|must\s+not\s+tell|mustn't\s+tell)\b/g),
  p('secrecy.az.dontTell', 'SECRECY', 0.85, 'az',
    /\b(?:atama|atana|ataya|anama|anana|anaya|ailene|aileye|ailenize|aileme|evdekilere|hec\s+kime|kimseye|basqasina|basqalarina|qardasima|qardasina|bacima|bacina|esime|yoldasima|bankda|banka|bank\s+(?:iscilerine|emekdaslarina)|iscilerine|emekdaslarina|polise)\b(?:\s+\S+){0,3}?\s+(?:hec\s+ne\s+)?(?:deme|demeyin|demesin|danisma|danismayin|bildirme|bildirmeyin|xeber\s+verme|xeber\s+vermeyin|soyleme|soylemeyin|acma|acmayin)\b/g,
    { kind: 'tellNeg' }),
  p('secrecy.az.secret', 'SECRECY', 0.85, 'az',
    /\b(?:gizli\s+(?:saxla\w*|qalsin|qalmalidir|emeliyyat\w*|istintaq\w*)|sirr\s+(?:olaraq\s+)?(?:saxla\w*|qalsin)|aramizda\s+qalsin|mexfi\s+(?:emeliyyat\w*|istintaq\w*)|istintaq\s+sirri\w*|(?:atam|anam|ailem|hec\s+kim)\s+bilmesin|hec\s+kim\s+bilmemelidir|kimseye\s+danismamalisiniz)\b/g),
  // Grooming secrecy: hide the relationship from parents, delete the chat.
  p('secrecy.en.ourSecret', 'SECRECY', 0.85, 'en', /\bour\s+(?:little\s+|special\s+)?secret\b/g),
  p('secrecy.en.betweenUs', 'SECRECY', 0.85, 'en',
    /\b(?:this|it|that)\s+(?:stays|remains|is\s+just|is\s+only)\s+between\s+us\b|\bjust\s+between\s+us\b|\bbetween\s+us\s+two\b/g),
  p('secrecy.en.deleteChat', 'SECRECY', 0.85, 'en',
    /\b(?:delete|clear|erase|wipe)\s+(?:our|all\s+our)\s+(?:chats?|messages?|conversations?|texts?|dms?|history)\b|\b(?:delete|clear|erase)\s+(?:this|these|the|all\s+(?:these|the))\s+(?:chats?|messages?|conversations?|texts?|dms?)\s+(?:after|so|before|when|once)\b/g),
  p('secrecy.en.dontLet', 'SECRECY', 0.85, 'en',
    /\b(?:don't|do\s+not|dont|never)\s+(?:ever\s+)?(?:tell|show)\s+(?:ur|your)\s+(?:parents|mom|mum|dad|family|teachers?|friends)\b|\b(?:don't|do\s+not|dont)\s+let\s+(?:anyone|anybody|your\s+parents|ur\s+parents|your\s+(?:mom|mum|dad))\s+(?:see|know|find\s+out|read)\b/g,
    { kind: 'tellNeg' }),
  p('secrecy.az.parents', 'SECRECY', 0.85, 'az',
    /\b(?:valideyn\w*|anana|atana|mamana|papana|evdekiler\w*|muellim\w*|hec\s+kese|hec\s+kime)\b(?:\s+\S+){0,3}?\s+(?:hec\s+ne\s+)?(?:deme|demeyin|danisma|bildirme|soyleme|gosterme|xeber\s+verme)\b/g,
    { kind: 'tellNeg' }),
  p('secrecy.az.ourSecret', 'SECRECY', 0.85, 'az',
    /\b(?:bizim\s+)?(?:kicik\s+|balaca\s+)?sirrimiz\w*|\baramizda\s+qalacaq\b|\b(?:valideynlerin|anan|atan|hec\s+kes|kimse)\s+bilmesin\b/g),
  p('secrecy.az.deleteChat', 'SECRECY', 0.85, 'az',
    /\b(?:yazismamizi|yazismalarimizi|mesajlarimizi|catimizi|yazismani)\s+(?:\S+\s+)?(?:sil|silersen|silmeyi\s+unutma|temizle)\b/g),

  /* ================================================================ */
  /* CHILD SAFETY (DaCy Kids)                                          */
  /* ================================================================ */

  /* ---------------------------------------------------------------- */
  /* TRUST_GROOMING — unusual closeness, flattery, "only I get you"    */
  /* ---------------------------------------------------------------- */
  p('trust.en.mature', 'TRUST_GROOMING', 0.8, 'en',
    /\b(?:you're|you\s+are|youre|ur|u\s+r)\s+(?:(?:so|really|very|such\s+a|way|much|super|incredibly)\s+)*(?:more\s+)?mature\b|\bmature\s+for\s+(?:your|ur)\s+age\b/g),
  p('trust.en.onlyMe', 'TRUST_GROOMING', 0.85, 'en',
    /\bonly\s+i\s+(?:really\s+|truly\s+)?(?:understand|get|know)\s+(?:you|u)\b|\b(?:i'm|i\s+am|im)\s+the\s+only\s+one\s+(?:who\s+|that\s+)?(?:really\s+|truly\s+)?(?:understands?|gets?|cares?\s+about|loves?)\s+(?:you|u)\b|\b(?:no\s*one|nobody)\s+(?:else\s+)?(?:understands?|gets?|cares?\s+about)\s+(?:you|u)\s+like\s+(?:i\s+do|me)\b/g),
  p('trust.en.special', 'TRUST_GROOMING', 0.7, 'en',
    /\b(?:you're|you\s+are|youre|ur|u\s+r)\s+(?:so\s+|really\s+|very\s+|truly\s+|super\s+)?(?:special|different\s+from\s+(?:the\s+)?others?)\b/g),
  p('trust.en.littleSecret', 'TRUST_GROOMING', 0.75, 'en', /\bour\s+(?:little\s+|special\s+)?secret\b/g),
  p('trust.en.moreThanThem', 'TRUST_GROOMING', 0.8, 'en',
    /\bi\s+care\s+(?:about\s+(?:you|u)\s+)?more\s+than\s+(?:they\s+do|them|your\s+(?:parents|family|friends|mom|mum|dad))\b|\b(?:your\s+(?:parents|mom|mum|dad|family|teachers?)|adults|grown-?ups)\s+(?:don't|do\s+not|dont|doesn't|does\s+not|wouldn't|would\s+not|won't|will\s+not|never)\s+(?:really\s+)?(?:understand|get|care\s+about|listen\s+to)\s+(?:you|u|us|it)\b/g),
  p('trust.en.theyWont', 'TRUST_GROOMING', 0.6, 'en',
    /\b(?:they|others|people)\s+(?:wouldn't|would\s+not|won't|will\s+not)\s+(?:understand|get\s+it|get\s+us)\b|\byou\s+can\s+tell\s+me\s+anything\b/g),
  p('trust.az.mature', 'TRUST_GROOMING', 0.8, 'az',
    /\byasina\s+gore\s+(?:\S+\s+){0,2}?(?:yetkin|boyuk|agilli|ciddi|kamil)\w*|\b(?:cox|lap|nece\s+de|ele)\s+yetkinsen\b/g),
  p('trust.az.onlyMe', 'TRUST_GROOMING', 0.85, 'az',
    /\b(?:ancaq|yalniz|tekce|birce)\s+men\s+(?:seni\s+)?(?:basa\s+dus|anlay)\w*|\b(?:hec\s+kim|kimse)\s+seni\s+(?:\S+\s+){0,2}?(?:basa\s+dusmur|anlamir)\w*|\bseni\s+menden\s+(?:yaxsi|cox)\s+(?:hec\s+kim|kimse)\s+(?:basa\s+dusmur|anlamir|tanimir)\w*/g),
  p('trust.az.special', 'TRUST_GROOMING', 0.7, 'az',
    /\b(?:cox\s+|lap\s+|ele\s+)?xususisen\b|\bsen\s+(?:cox\s+)?xususi\s+(?:birisen|insansan|qizsan|oglansan|adamsan)\b|\bbasqalarindan\s+(?:cox\s+)?ferqlisen\b/g),
  p('trust.az.littleSecret', 'TRUST_GROOMING', 0.75, 'az', /\b(?:bizim\s+)?(?:kicik|balaca)\s+sirrimiz\w*/g),
  p('trust.az.moreThanThem', 'TRUST_GROOMING', 0.8, 'az',
    /\bseni\s+(?:onlardan|valideyn\w*|ailenden|hamidan|anandan|atandan)\s+(?:daha\s+)?cox\s+(?:dusunur|isteyir|sevir|qiymetlendir|anlayir|basa\s+dusur)\w*|\b(?:valideynlerin|anan|atan|ailen|muellimlerin|boyukler)\s+seni\s+(?:\S+\s+)?(?:basa\s+dusmur|anlamir|qiymetlendirmir|esitmir|dinlemir)\w*/g),
  p('trust.az.theyWont', 'TRUST_GROOMING', 0.6, 'az',
    /\b(?:onlar|basqalari|valideynlerin|boyukler)\s+(?:bunu\s+)?(?:basa\s+dusmez|anlamaz|basa\s+dusmeyecek|anlamayacaq)\w*|\bmene\s+her\s+seyi\s+(?:deye|danisa|yaza)\s+bilersen\b/g),

  /* ---------------------------------------------------------------- */
  /* GIFT_GROOMING — gifts, gift cards, game currency                   */
  /* ---------------------------------------------------------------- */
  p('gift.en.offer', 'GIFT_GROOMING', 0.85, 'en',
    /\b(?:i'll|i\s+will|ill|i\s+can|i\s+could|let\s+me|i'm\s+gonna|im\s+gonna|i'm\s+going\s+to|i\s+want\s+to|want\s+me\s+to)\s+(?:buy|get|send|give|gift)\s+(?:you|u)\s+(?:\S+\s+){0,3}?(?:robux|v-?bucks|skins?|gems|coins|diamonds|nitro|battle\s*pass|gift\s*cards?|presents?|gifts?|money|cash|a\s+new\s+phone|phone|clothes|makeup)\b/g),
  p('gift.en.buyYou', 'GIFT_GROOMING', 0.7, 'en',
    /\b(?:i'll|i\s+will|ill|i\s+can|let\s+me|i'm\s+gonna|im\s+gonna|i\s+want\s+to)\s+(?:buy|gift)\s+(?:you|u)\b/g),
  p('gift.en.currency', 'GIFT_GROOMING', 0.6, 'en', /\b(?:free|some)\s+(?:robux|v-?bucks)\b|\bgift\s*cards?\b/g),
  p('gift.az.offer', 'GIFT_GROOMING', 0.85, 'az',
    /\bsene\s+(?:\S+\s+){0,2}?(?:hediyye\w*|robux|v-?bucks|skin\w*|almaz\w*|telefon\w*|pul)\s+(?:alaram|alacam|alacagam|gondererem|gonderrem|gonderecem|gondereceyem|ataram|atacam|verrem|vererem|verecem|vereceyem)\b|\b(?:robux|v-?bucks|vbucks|skin\w*|almaz\w*|hediyye\s+kart\w*)\s+(?:\S+\s+)?(?:alaram|alacam|alacagam|gondererem|gonderrem|gonderecem|gondereceyem|ataram|atacam|verrem|vererem|verecem|vereceyem)\b/g),
  p('gift.az.card', 'GIFT_GROOMING', 0.6, 'az', /\bhediyye\s+kart\w*|\bpulsuz\s+(?:robux|v-?bucks)\b/g),

  /* ---------------------------------------------------------------- */
  /* PERSONAL_INFO_PROBE — age, school, address, home alone            */
  /* ---------------------------------------------------------------- */
  p('probe.en.age', 'PERSONAL_INFO_PROBE', 0.85, 'en',
    /\bhow\s+old\s+(?:are|r)\s+(?:you|u)\b|\bwhat(?:'s|\s+is)\s+(?:your|ur)\s+age\b|\bwhat\s+year\s+were\s+you\s+born\b/g),
  p('probe.en.school', 'PERSONAL_INFO_PROBE', 0.8, 'en',
    /\b(?:which|what)\s+school\b|\bwhere\s+do\s+(?:you|u)\s+go\s+to\s+school\b|\b(?:which|what)\s+grade\s+(?:are|r)\s+(?:you|u)\b/g),
  p('probe.en.address', 'PERSONAL_INFO_PROBE', 0.85, 'en',
    /\bwhere\s+(?:do|d)\s+(?:you|u)\s+live\b|\bwhat(?:'s|\s+is)\s+(?:your|ur)\s+(?:home\s+)?address\b|\bsend\s+(?:me\s+)?(?:your|ur)\s+(?:home\s+)?(?:address|location)\b|\bshare\s+(?:your|ur)\s+location\b|\bwhich\s+(?:street|building|neighbou?rhood|apartment)\b/g),
  p('probe.en.alone', 'PERSONAL_INFO_PROBE', 0.85, 'en',
    /\b(?:are|r)\s+(?:you|u)\s+(?:home\s+alone|alone\s+(?:at\s+home|now|right\s+now|tonight|today)|by\s+yourself\s+(?:at\s+home|now))\b|\b(?:will|do)\s+(?:you|u)\s+be\s+(?:home\s+)?alone\b/g),
  p('probe.en.parents', 'PERSONAL_INFO_PROBE', 0.85, 'en',
    /\bwhen\s+(?:are|do|will|is)\s+(?:your|ur)\s+(?:parents|mom|mum|dad|family|folks)\s+(?:\S+\s+)?(?:out|away|at\s+work|not\s+(?:at\s+)?home|leave|go\s+out|working|asleep|sleeping|going\s+out)\b|\bwhen\s+(?:is|are)\s+(?:no\s*one|nobody)\s+(?:at\s+)?home\b|\bdo\s+(?:your|ur)\s+parents\s+(?:check|read|look\s+at|go\s+through|see)\s+(?:your|ur)\s+(?:phone|messages|chats|dms)\b|\bare\s+(?:your|ur)\s+parents\s+(?:home|around|watching|nearby)\b/g),
  p('probe.az.age', 'PERSONAL_INFO_PROBE', 0.85, 'az',
    /\bnece\s+yas(?:in|iniz)\s+var\b|\byasin\s+necedir\b|\bnece\s+yasindasan\b|\bnecenci\s+ilde\s+anadan\s+olmusan\b/g),
  p('probe.az.school', 'PERSONAL_INFO_PROBE', 0.8, 'az',
    /\bhansi\s+mekteb\w*|\bhansi\s+sinif\w*|\bnecenci\s+sinif\w*|\bhar(?:a)?da\s+oxuyursan\b/g),
  p('probe.az.address', 'PERSONAL_INFO_PROBE', 0.85, 'az',
    /\bhar(?:a)?da\s+(?:\S+\s+)?yasayir\w*|\bunvan(?:in|ini|iniz|inizi)\b|\bev(?:in|iniz)\s+har(?:a)?d\w*|\bhansi\s+(?:kuce|bina|rayon|mehelle|mikrorayon|blok)\w*|\b(?:yerini|lokasiya(?:ni|n)|unvanini)\s+(?:\S+\s+)?(?:at|atarsan|gonder\w*|paylas\w*)\b/g),
  p('probe.az.alone', 'PERSONAL_INFO_PROBE', 0.85, 'az',
    /\bevde\s+(?:indi\s+|bu\s+gun\s+)?tek(?:sen|senmi|sinizmi)?\b|\bevde\s+tek\s+qal\w*|\btek\s+qalanda\b/g),
  p('probe.az.parents', 'PERSONAL_INFO_PROBE', 0.85, 'az',
    /\b(?:valideynlerin|anan|atan|evdekiler)\s+ne\s+vaxt\s+(?:\S+\s+){0,2}?(?:olmur|olmurlar|olmayacaq|isde|isdedir|isdedirler|cixir\w*|gedir\w*|yatir\w*)\b|\b(?:valideynlerin|anan|atan)\s+(?:senin\s+)?telefon\w*\s+(?:\S+\s+)?(?:baxir|yoxlayir|oxuyur)\w*|\b(?:valideynlerin|anan|atan)\s+(?:indi\s+)?evdedir\w*/g),

  /* ---------------------------------------------------------------- */
  /* PERSONAL_IMAGE_REQUEST — photos / videos of the child             */
  /* Only `hard` patterns alert a guardian on their own. Ambiguous      */
  /* wording ("send me a pic", "şəklini at" — also "its photo",          */
  /* "send a selfie from the trip") stays below 0.7 and only adds       */
  /* points; it needs grooming context before anyone is alerted.        */
  /* ---------------------------------------------------------------- */
  p('img.en.ofYou', 'PERSONAL_IMAGE_REQUEST', 0.9, 'en',
    rx(String.raw`\b(?:send|show|give|text|dm|snap|share)\s+(?:me\s+|us\s+)?(?:a\s+|an\s+|some\s+|another\s+|one\s+more\s+|more\s+|new\s+)?(?:\w+\s+){0,2}?${EN_IMG}\s+of\s+(?:you|yourself|u|urself|just\s+you|your\s+face)\b`), { hard: true }),
  p('img.en.want', 'PERSONAL_IMAGE_REQUEST', 0.85, 'en',
    rx(String.raw`\b(?:can\s+i\s+(?:see|have|get)|i\s+want|i\s+need|i'd\s+love|i\s+would\s+love|do\s+you\s+have|got\s+any)\s+(?:a\s+|an\s+|some\s+|another\s+|more\s+)?(?:\w+\s+)?${EN_IMG}\s+of\s+(?:you|yourself|u|urself|your\s+face)\b`),
    { hard: true }),
  // "Send a selfie from the trip!" is ordinary family chat: below the alert threshold on its own.
  p('img.en.selfie', 'PERSONAL_IMAGE_REQUEST', 0.6, 'en',
    /\b(?:send|give|text|dm|snap|show)\s+(?:me\s+|us\s+)?(?:a\s+|another\s+|one\s+more\s+|more\s+|some\s+|new\s+)?(?:\w+\s+)?selfies?\b/g),
  // A private / personal photo only counts when it is REQUESTED ("send me a private photo") or is
  // "of you" / "just for me" — never "it's a private video" or "let's join private ones".
  p('img.en.private', 'PERSONAL_IMAGE_REQUEST', 0.85, 'en',
    rx(String.raw`\b(?:send|show|give|text|dm|snap|share|take|want|need)\b(?:\s+(?!(?:${EN_SCOPE_BREAK})\b)\S+){0,3}?\s+(?:private|personal)\s+(?:${EN_IMG}|ones?)\b|\b(?:private|personal)\s+(?:${EN_IMG}|ones?)\b,?(?:\s+\S+){0,3}?\s+(?:of\s+(?:you|yourself|u|urself)|(?:just|only)\s+for\s+(?:me|my\s+eyes))\b`),
    { hard: true }),
  p('img.en.secret', 'PERSONAL_IMAGE_REQUEST', 0.75, 'en', rx(String.raw`\bsecret\s+${EN_IMG}\b`)),
  p('img.en.forMe', 'PERSONAL_IMAGE_REQUEST', 0.8, 'en',
    rx(String.raw`\b${EN_IMG}\b(?:\s+\S+){0,3}?\s+(?:just|only)\s+for\s+(?:me|my\s+eyes)\b|\bfor\s+my\s+eyes\s+only\b`),
    { hard: true }),
  p('img.en.lookLike', 'PERSONAL_IMAGE_REQUEST', 0.8, 'en', /\bshow\s+(?:me\s+)?what\s+(?:you|u)\s+look\s+like\b/g),
  p('img.en.sendMe', 'PERSONAL_IMAGE_REQUEST', 0.65, 'en',
    /\b(?:send|give|text|dm|snap)\s+(?:me|us)\s+(?:a\s+|an\s+|some\s+|another\s+|one\s+more\s+|more\s+|new\s+)?(?:(?:cute|nice|new|recent|real|quick|good|pretty)\s+)?(?:photos?|pics?|pictures?|snaps?)\b(?!\s+(?:of|from)\b)/g),
  p('img.en.seeYou', 'PERSONAL_IMAGE_REQUEST', 0.6, 'en',
    /\b(?:see|know)\s+what\s+(?:you|u)\s+look\s+like\b|\bwhat\s+do\s+(?:you|u)\s+look\s+like\b/g),
  p('img.en.deleteAfter', 'PERSONAL_IMAGE_REQUEST', 0.6, 'en',
    /\bdelete\s+(?:it|them|the\s+(?:photos?|pics?|pictures?|videos?))\s+(?:right\s+)?(?:after|afterwards|later)\b|\bi(?:'ll|\s+will)\s+delete\s+(?:it|them)\s+(?:right\s+)?(?:after|afterwards|later|straight\s+away)\b/g),
  p('img.en.camera', 'PERSONAL_IMAGE_REQUEST', 0.65, 'en',
    /\b(?:turn\s+on|switch\s+on|open|put\s+on)\s+(?:your\s+|ur\s+|the\s+)?(?:camera|cam|webcam)\b|\b(?:video\s+call|facetime)\s+(?:me|with\s+me)\b|\blet's\s+(?:video\s+(?:call|chat)|facetime)\b/g),
  p('img.az.ofYourself', 'PERSONAL_IMAGE_REQUEST', 0.9, 'az',
    rx(String.raw`\b(?:ozunun|oz|senin)\s+(?:bir\s+)?(?:\S+\s+)?${AZ_IMG}\s+(?:\S+\s+){0,2}?${AZ_IMG_VERB}\b`),
    { hard: true }),
  // Bare "şəklini at" is also "send ITS photo" (the phone, the shoes …): below the alert threshold.
  p('img.az.yourPhoto', 'PERSONAL_IMAGE_REQUEST', 0.6, 'az',
    rx(String.raw`\b(?:sek(?:i)?l(?:ler)?ini|selfi(?:ler)?(?:ini|ni)|foto(?:lar)?(?:ini|nu)|videonu)\s+(?:\S+\s+)?${AZ_IMG_VERB}\b`)),
  p('img.az.selfie', 'PERSONAL_IMAGE_REQUEST', 0.6, 'az',
    /\bselfi(?:ni|n|ler\w*)?\s+(?:\S+\s+)?(?:at|atarsan|ata\s+bilersen|gonder|gonderersen|gondere\s+bilersen|cekib\s+(?:at|gonder))\b/g),
  // "Şəxsi / gizli şəkil" only when requested ("şəxsi şəkil istəyirəm", "şəxsi bir şəkil olsun");
  // "xüsusi" (special) is not here: "müəllim üçün xüsusi video hazırlayaq" is a class project.
  p('img.az.private', 'PERSONAL_IMAGE_REQUEST', 0.85, 'az',
    rx(String.raw`\b(?:sexsi|gizli|mexfi)\s+(?:bir\s+)?${AZ_IMG}\s+(?:\S+\s+){0,2}?(?:${AZ_IMG_VERB}|olsun|lazimdir)\b`),
    { hard: true }),
  p('img.az.forMe', 'PERSONAL_IMAGE_REQUEST', 0.8, 'az',
    rx(String.raw`${AZ_IMG}\s+(?:\S+\s+){0,2}?(?:yalniz|tekce|sirf)\s+menim\s+ucun\b`),
    { hard: true }),
  p('img.az.forMeVerb', 'PERSONAL_IMAGE_REQUEST', 0.65, 'az',
    /\b(?:ancaq|yalniz|tekce|sirf)\s+menim\s+ucun\s+(?:\S+\s+)?(?:cek\w*|gonder\w*|at|atarsan|olsun)\b/g),
  p('img.az.lookLike', 'PERSONAL_IMAGE_REQUEST', 0.8, 'az',
    /\bnece\s+gorundu\w*\s+(?:\S+\s+)?goster(?:sene|in|ersen)?\b/g),
  p('img.az.sendMe', 'PERSONAL_IMAGE_REQUEST', 0.65, 'az',
    rx(String.raw`\bmene\s+(?:bir\s+)?(?:\S+\s+)?(?:sek(?:i)?l\w*|foto\w*|selfi\w*)\s+${AZ_IMG_VERB}\b`)),
  p('img.az.seeYou', 'PERSONAL_IMAGE_REQUEST', 0.6, 'az',
    /\bnece\s+gorundu\w*\s+(?:\S+\s+)?gormek\s+isteyir\w*/g),
  p('img.az.deleteAfter', 'PERSONAL_IMAGE_REQUEST', 0.6, 'az',
    /\b(?:sonra|baxandan\s+sonra|gorenden\s+sonra|sonradan)\s+(?:\S+\s+)?(?:silersen|silersiz|silerem|silecem|sil)\b/g),
  p('img.az.camera', 'PERSONAL_IMAGE_REQUEST', 0.65, 'az',
    /\bkamera(?:ni|nu|n)?\s+(?:\S+\s+)?(?:ac|acarsan|aca\s+bilersen|yandir|qos)\b|\bvideo\s*-?\s*zeng\w*\s+(?:\S+\s+)?(?:edek|edeq|et|edersen|ede\s+bilersen)\b/g),
  // Hard negatives: photos of homework, notes, a page, the cat, the trip …
  p('img.en.benignObject', 'PERSONAL_IMAGE_REQUEST', 0.5, 'en',
    rx(String.raw`\b(?:${EN_IMG}|screenshots?|scans?)\s+of\s+(?:the|my|our|this|that|your|his|her|their|a|an)\s+(?:\S+\s+){0,2}?${EN_BENIGN_PHOTO_OBJ}\b|\b(?:homework|notes|worksheet|answers|timetable|schedule)\s+(?:photos?|pics?|pictures?|screenshots?)\b`),
    { kind: 'benign' }),
  p('img.az.benignObject', 'PERSONAL_IMAGE_REQUEST', 0.5, 'az',
    rx(String.raw`\b(?:ev\s+)?${AZ_BENIGN_PHOTO_OBJ}\s+(?:\S+\s+)?(?:${AZ_IMG}|skrin\w*|ekran\s+sekl\w*)`),
    { kind: 'benign' }),

  /* ---------------------------------------------------------------- */
  /* MEETING_REQUEST — offline meeting, "come alone"                   */
  /* ---------------------------------------------------------------- */
  p('meet.en.lets', 'MEETING_REQUEST', 0.6, 'en',
    /\b(?:let's|lets|let\s+us|we\s+(?:should|could|can)|wanna|want\s+to|do\s+you\s+want\s+to|can\s+we|shall\s+we)\s+meet(?:\s+up)?\b|\b(?:when|where)\s+can\s+we\s+meet\b|\bmeet\s+me\b/g),
  // Meeting "in person" or at the school gate is also what a parent, grandparent or coach says:
  // below the alert threshold unless combined with secrecy, "come alone" or other grooming signs.
  p('meet.en.inPerson', 'MEETING_REQUEST', 0.65, 'en',
    /\bmeet\s+(?:up\s+)?(?:in\s+person|irl|in\s+real\s+life|face\s+to\s+face|for\s+real)\b/g),
  p('meet.en.alone', 'MEETING_REQUEST', 0.9, 'en',
    /\bcome\s+(?:alone|by\s+yourself|on\s+your\s+own)\b|\b(?:don't|do\s+not|dont)\s+bring\s+(?:anyone|anybody|your\s+(?:friends?|parents|mom|mum|dad))\b/g,
    { hard: true }),
  p('meet.en.place', 'MEETING_REQUEST', 0.65, 'en',
    /\bmeet\s+(?:me\s+)?(?:up\s+)?(?:at|in|near|behind|outside)\s+(?:the\s+)?(?:mall|park|cinema|cafe|station|metro|playground|shopping\s+cent(?:er|re))\b|\bcome\s+(?:over\s+)?to\s+my\s+(?:place|house|flat|apartment)\b/g),
  p('meet.en.car', 'MEETING_REQUEST', 0.85, 'en',
    /\bmeet\s+(?:me\s+)?(?:at|in)\s+my\s+(?:car|hotel)\b|\b(?:get|come)\s+in(?:to)?\s+my\s+car\b/g,
    { hard: true }),
  p('meet.en.pickUp', 'MEETING_REQUEST', 0.65, 'en',
    /\b(?:i'll|i\s+will|ill|i\s+can|i\s+could|let\s+me)\s+(?:come\s+(?:and\s+)?)?pick\s+(?:you|u)\s+up\b/g),
  p('meet.en.school', 'MEETING_REQUEST', 0.6, 'en',
    /\b(?:i'll|i\s+will|ill|i\s+can)\s+(?:come\s+to|wait\s+(?:for\s+(?:you|u)\s+)?(?:at|outside|near|by))\s+(?:your|ur)\s+(?:school|house|home|building)\b/g),
  p('meet.az.lets', 'MEETING_REQUEST', 0.6, 'az',
    /\b(?:gel\s+)?gorusek(?:mi)?\b|\bgorusmek\s+(?:\S+\s+)?isteyir\w*|\bgoruse\s+bilerik\b/g),
  p('meet.az.inPerson', 'MEETING_REQUEST', 0.65, 'az',
    /\b(?:real\s+heyatda|canli|uz\s*-?\s*uze|yaxindan)\s+(?:\S+\s+)?gorus\w*/g),
  p('meet.az.alone', 'MEETING_REQUEST', 0.9, 'az',
    /\btek\s+(?:\S+\s+)?(?:gel|gelersen|gelmelisen|gelesen|gelin)\b|\bhec\s+kimi\s+(?:ozunle\s+)?(?:getirme|gotirme|gotume)\b|\bozunle\s+hec\s+kimi\s+(?:getirme|gotirme)\b/g,
    { hard: true }),
  p('meet.az.place', 'MEETING_REQUEST', 0.65, 'az',
    /\b(?:ticaret\s+merkez|park|kino|kafe|metro|stansiya|meydanca)\w*\s+(?:\S+\s+)?(?:gorusek|gozleyecem|gozleyerem|gel)\b|\b(?:menim\s+)?evime\s+(?:\S+\s+)?(?:gel|gelersen)\b/g),
  p('meet.az.car', 'MEETING_REQUEST', 0.85, 'az', /\b(?:menim\s+)?masinima\s+(?:\S+\s+)?(?:min|minersen|otur)\b/g, { hard: true }),
  p('meet.az.pickUp', 'MEETING_REQUEST', 0.65, 'az',
    /\bseni\s+(?:\S+\s+){0,2}?(?:goturerem|goturecem|gotureceyem|apararam|aparacam|aparacagam)\b/g),
  p('meet.az.school', 'MEETING_REQUEST', 0.6, 'az',
    /\b(?:mekteb\w*|ev\w*)\s+(?:\S+\s+)?(?:yaninda|qarsisinda|qabaginda|onunde)\s+(?:seni\s+)?gozleye\w*|\b(?:mektebine|evine)\s+(?:gelerem|gelecem|geleceyem)\b/g),
  // Hard negatives: a question offering a choice ("will you come alone or with your brother?").
  p('meet.en.aloneOrWith', 'MEETING_REQUEST', 0.5, 'en',
    /\bcome\s+(?:alone|by\s+yourself|on\s+your\s+own)\s*,?\s+or\s+(?:with|bring)\b/g,
    { kind: 'benign' }),
  p('meet.az.aloneOrWith', 'MEETING_REQUEST', 0.5, 'az',
    /\btek\s+(?:\S+\s+)?gel\w*\s*,?\s+(?:yoxsa|ya\s+da|ve\s+ya)\b/g,
    { kind: 'benign' }),

  /* ---------------------------------------------------------------- */
  /* SEXTORTION_THREAT — threat to share the child's images            */
  /* Always ≥ 80 when present, so every pattern needs a clear threat    */
  /* structure: a condition or ultimatum, or — for `bare` statements    */
  /* ("I'll send your photos to your parents") — a coercive context in  */
  /* the message or an earlier photo request (see header).             */
  /* ---------------------------------------------------------------- */
  p('sext.en.ifNot', 'SEXTORTION_THREAT', 0.95, 'en',
    rx(String.raw`${EN_IF_NOT}(?:\s+\S+){0,6}?\s+${EN_I_WILL}\s+${EN_THREAT_VERB}\s+(?:all\s+(?:of\s+)?)?(?:your|ur)\s+(?:\S+\s+)?${EN_IMG}\b`)),
  p('sext.en.ifNotIt', 'SEXTORTION_THREAT', 0.9, 'en',
    rx(String.raw`${EN_IF_NOT}(?:\s+\S+){0,6}?\s+${EN_I_WILL}\s+${EN_THREAT_VERB}\s+(?:it|them|everything|those|these)\s+(?:\S+\s+)?${EN_AUDIENCE}\b`)),
  p('sext.en.willShare', 'SEXTORTION_THREAT', 0.9, 'en',
    rx(String.raw`\b${EN_I_WILL}\s+${EN_THREAT_VERB}\s+(?:all\s+(?:of\s+)?)?(?:your|ur)\s+(?:\S+\s+)?${EN_IMG}\s+(?:\S+\s+){0,2}?${EN_AUDIENCE}\b`),
    { bare: true }),
  p('sext.en.leak', 'SEXTORTION_THREAT', 0.85, 'en',
    rx(String.raw`\b${EN_I_WILL}\s+(?:leak|spread|expose)\s+(?:all\s+(?:of\s+)?)?(?:your|ur)\s+(?:\S+\s+)?${EN_IMG}\b`),
    { bare: true }),
  p('sext.en.everyoneSees', 'SEXTORTION_THREAT', 0.85, 'en',
    rx(String.raw`\b(?:everyone|everybody|all\s+(?:of\s+)?your\s+friends|your\s+(?:friends|parents|family|mom|mum|dad|whole\s+school|school|class|classmates|teachers?))\s+(?:will|is\s+going\s+to|are\s+going\s+to|gonna|would)\s+see\s+(?:all\s+)?(?:your|ur|those|these)\s+(?:\S+\s+)?${EN_IMG}\b`),
    { bare: true }),
  p('sext.en.ifNotEveryone', 'SEXTORTION_THREAT', 0.85, 'en',
    /\bif\s+(?:you|u)\s+(?:don't|dont|do\s+not|won't|wont|will\s+not|refuse|stop|block|ignore|tell)\b,?(?:\s+\S+){0,8}?\s+(?:everyone|everybody|all\s+your\s+friends|your\s+(?:friends|parents|family|school|class))\s+(?:will|is\s+going\s+to|are\s+going\s+to|gonna)\s+see\s+(?:it|them|everything|your)\b/g),
  p('sext.en.orElse', 'SEXTORTION_THREAT', 0.9, 'en',
    rx(String.raw`\b(?:send|give|do\s+it|pay)\b(?:\s+\S+){0,4}?\s+or\s+(?:else\s+)?${EN_I_WILL}\s+${EN_THREAT_VERB}\s+(?:(?:all\s+(?:of\s+)?)?(?:your|ur)\s+(?:\S+\s+)?${EN_IMG}|(?:it|them|everything)\s+(?:\S+\s+)?${EN_AUDIENCE})\b`)),
  p('sext.en.expose', 'SEXTORTION_THREAT', 0.8, 'en', rx(String.raw`\b${EN_I_WILL}\s+(?:expose|humiliate)\s+(?:you|u)\b`)),
  p('sext.az.cond', 'SEXTORTION_THREAT', 0.95, 'az',
    rx(String.raw`\b${AZ_COND}\b,?(?:\s+\S+){0,6}?\s+(?:${AZ_IMG_ACC}|${AZ_AUDIENCE})\s+(?:\S+\s+){0,4}?${AZ_THREAT_FUT}\b`)),
  p('sext.az.condSees', 'SEXTORTION_THREAT', 0.9, 'az',
    rx(String.raw`\b${AZ_COND}\b,?(?:\s+\S+){0,6}?\s+${AZ_SEES}\s+(?:\S+\s+){0,2}?(?:gorecek|gorecekler)\b`)),
  p('sext.az.yours', 'SEXTORTION_THREAT', 0.9, 'az',
    rx(String.raw`\bsenin\s+(?:\S+\s+)?${AZ_IMG_ACC}\s+(?:\S+\s+){0,3}?${AZ_AUDIENCE}\s+(?:\S+\s+){0,3}?${AZ_THREAT_FUT}\b|\bsenin\s+(?:\S+\s+)?${AZ_IMG}\s+(?:\S+\s+){0,2}?${AZ_SEES}\s+(?:\S+\s+)?gorecek\w*`),
    { bare: true }),
  p('sext.az.orElse', 'SEXTORTION_THREAT', 0.9, 'az',
    rx(String.raw`\b(?:gonder|at|ode)\w*\s*,?\s+(?:yoxsa|eks\s+halda)\b(?:\s+\S+){0,4}?\s+(?:${AZ_IMG_ACC}|${AZ_AUDIENCE})\s+(?:\S+\s+){0,3}?${AZ_THREAT_FUT}\b`)),
  p('sext.az.shame', 'SEXTORTION_THREAT', 0.85, 'az',
    /\bseni\s+(?:\S+\s+){0,2}?(?:rusvay|biabir|xar)\s+(?:edecem|edeceyem|edecegem|ederem)\b/g),

  /* ---------------------------------------------------------------- */
  /* PROTECTIVE_ADVICE (hard negatives)                                */
  /* ---------------------------------------------------------------- */
  p('protect.en.neverAsk', 'PROTECTIVE_ADVICE', 0.85, 'en',
    /\b(?:will|would|do|does|shall|should|can)\s*(?:never|not|n't)\s+(?:ever\s+)?(?:ask|request|call\s+(?:you\s+)?to\s+ask)\b|\bwon't\s+(?:ever\s+)?ask\b|\bnever\s+(?:asks?|requests?)\b|\bno\s+(?:\w+\s+){0,3}(?:will|would)\s+(?:ever\s+)?ask\b/g,
    { kind: 'neverAsk' }),
  p('protect.en.neverShare', 'PROTECTIVE_ADVICE', 0.85, 'en',
    rx(String.raw`\b(?<!\bif\s+(?:you|u)\s+)(?:never|do\s+not|don't|dont)\s+(?:ever\s+)?(?:share|give|send|disclose|reveal|forward|dictate|tell|enter|type|show|read\s+out|install|download|transfer|pay)\b(?:\s+(?!(?:${EN_SCOPE_BREAK})\b)\S+){0,8}?\s+(?:codes?|otp|pin|passcode|passwords?|cvv2?|cvc2?|card\s+(?:number|details|data)|login|credentials|personal\s+data|anydesk|teamviewer|remote|apps?|money|fees?)\b`),
    { kind: 'advice' }),
  p('protect.en.scammers', 'PROTECTIVE_ADVICE', 0.75, 'en',
    /\b(?:scammers|fraudsters|criminals|swindlers|con\s+artists|crooks)\s+(?:often\s+|usually\s+|may\s+|might\s+|can\s+|sometimes\s+|also\s+)?(?:pretend|pose|posing|call|ask|send|use|claim|impersonate|introduce|try\s+to\s+(?:get|trick|obtain))\w*\b/g,
    { kind: 'warning' }),
  p('protect.en.ifSomeone', 'PROTECTIVE_ADVICE', 0.75, 'en',
    /\bif\s+(?:someone|anyone|somebody|a\s+caller|the\s+caller|they)\s+(?:\w+\s+){0,2}?(?:asks?|requests?|calls?|says?|tells?|offers?)\b/g,
    { kind: 'warning' }),
  p('protect.en.beware', 'PROTECTIVE_ADVICE', 0.7, 'en',
    /\b(?:beware\s+of|watch\s+out\s+for|be\s+careful\s+(?:of|with)|be\s+aware\s+of)\b|\b(?:hang\s+up|end\s+the\s+call)\s+and\s+call\b|\bcall\s+(?:us|your\s+bank|the\s+bank)\s+(?:directly\s+)?(?:on|at)\s+the\s+(?:official\s+)?number\b|\b(?:it\s+is|it's|this\s+is)\s+(?:always\s+|probably\s+)?a\s+scam\b/g,
    { kind: 'advice' }),
  p('protect.az.neverAsk', 'PROTECTIVE_ADVICE', 0.85, 'az',
    /\bhec\s+(?:vaxt|zaman|bir\s+halda)\b(?:\s+\S+){0,12}?\s+(?:sorusmur|sorusmuruq|sorusmayacaq|sorusmayacagiq|sorusmaz|sorusmariq|istemir|istemirik|istemeyecek|istemeyeceyik|istemez|teleb\s+etmir|teleb\s+etmirik|teleb\s+etmeyecek|teleb\s+etmeyeceyik|teleb\s+etmez)\b/g,
    { kind: 'neverAsk' }),
  p('protect.az.codeNotAsked', 'PROTECTIVE_ADVICE', 0.8, 'az',
    /\b(?:kod|kodu|kodlari|sifre|sifreni|pin|cvv|kart\s+melumatlar\w*|parol\w*)\b(?:\s+\S+){0,5}?\s+(?:sorusmur|sorusmuruq|sorusmaz|istemir|istemirik|teleb\s+etmir|teleb\s+etmirik)\b/g,
    { kind: 'neverAsk' }),
  p('protect.az.dontShare', 'PROTECTIVE_ADVICE', 0.85, 'az',
    rx(String.raw`\b(?:kod\w*|sifre\w*|parol\w*|pin(?:\s*-?kod\w*)?|cvv\w*|cvc\w*|kart\s+(?:nomre|melumat)\w*|kart\w*\s+(?:nomre|melumat)\w*|anydesk|teamviewer)\b(?:\s+(?!(?:${AZ_REQ_VERBS})\b)\S+){0,6}?\s+(?:paylasmayin|paylasma|demeyin|deme|vermeyin|verme|gondermeyin|gonderme|bildirmeyin|soylemeyin|yazmayin|daxil\s+etmeyin|qurasdirmayin|yuklemeyin)\b`),
    { kind: 'advice' }),
  p('protect.az.dontSendMoney', 'PROTECTIVE_ADVICE', 0.8, 'az',
    /\b(?:pul\w*|vesait\w*)\b(?:\s+\S+){0,4}?\s+(?:gondermeyin|kocurmeyin|vermeyin)\b/g,
    { kind: 'advice' }),
  p('protect.az.scammers', 'PROTECTIVE_ADVICE', 0.75, 'az',
    /\b(?:deleduz|firildaqci|saxtakar)\w*\b(?:\s+\S+){0,10}?\s+(?:ozlerini|adindan|kimi\s+teqdim|zeng\s+ed\w*|sorus\w*|isteyir\w*|teleb\s+edir\w*|gonderir\w*)/g,
    { kind: 'warning' }),
  p('protect.az.ifSomeone', 'PROTECTIVE_ADVICE', 0.75, 'az',
    /\beger\s+(?:kimse|biri|birisi|zeng\s+eden)\s+(?:\S+\s+){0,4}?(?:sorussa|istese|teleb\s+etse|zeng\s+etse|dese)\b/g,
    { kind: 'warning' }),
  p('protect.az.careful', 'PROTECTIVE_ADVICE', 0.7, 'az',
    /\b(?:ehtiyatli|diqqetli|ayiq)\s+olun\b|\bzengi\s+(?:bitirin|kesin|dayandirin)\b(?:\s+\S+){0,5}?\s+zeng\s+edin\b|\bbu\s+firildaqdir\b/g,
    { kind: 'advice' }),
  // Child-safety advice ("never send photos of yourself to strangers"). Tokens that start a new
  // instruction or a threat ("don't send more, I'LL share your photo") end the negation's scope,
  // and a condition is not advice: "IF YOU don't send another photo, I'll share…" is a threat.
  p('protect.en.neverSendPhotos', 'PROTECTIVE_ADVICE', 0.8, 'en',
    rx(String.raw`\b(?<!\bif\s+(?:you|u)\s+)(?:never|don't|do\s+not|dont)\s+(?:ever\s+)?(?:send|share|post|show|give)\s+(?:(?!(?:${EN_SCOPE_BREAK}|i'll|i|ill|or|and|me|us|send|share|show|give)\b)\S+\s+){0,3}?${EN_IMG}\b`),
    { kind: 'advice' }),
  p('protect.az.dontSendPhotos', 'PROTECTIVE_ADVICE', 0.8, 'az',
    rx(String.raw`\b${AZ_IMG}\b(?:\s+(?!(?:${AZ_REQ_VERBS}|at)\b)\S+){0,4}?\s+(?:gondermeyin|gonderme|paylasmayin|paylasma|atmayin|atma|gostermeyin|gosterme|vermeyin|verme)\b`),
    { kind: 'advice' }),
  // Safety lessons describing groomers in the third person ("strangers online may ask for photos").
  p('protect.en.strangers', 'PROTECTIVE_ADVICE', 0.75, 'en',
    /\b(?:(?:strangers|predators|groomers|bad\s+people)(?:\s+(?:you\s+meet\s+)?online|\s+on\s+the\s+internet)?|(?:some\s+)?(?:people|adults)\s+(?:you\s+meet\s+)?online|someone\s+you\s+(?:only\s+)?(?:know|met)\s+online)\s+(?:often\s+|usually\s+|may\s+|might\s+|can\s+|could\s+|sometimes\s+|also\s+|will\s+)?(?:pretend|pose|ask|try|use|offer|send|threaten|say|claim|promise)\w*\b/g,
    { kind: 'warning' }),
  p('protect.az.strangers', 'PROTECTIVE_ADVICE', 0.75, 'az',
    /\b(?:yad\s+(?:adam|insan|sexs)\w*|tanimadig\w*\s+(?:adam|insan|sexs)\w*|internetdeki\s+(?:yad\w*|adam\w*|insan\w*)|pis\s+niyyetli\s+\S+)\s+(?:\S+\s+){0,6}?(?:isteye\s+biler|isteyir\w*|teklif\s+ed\w*|hedeleye\s+biler|hedeleyir\w*|sorusa\s+biler|sorusur\w*)/g,
    { kind: 'warning' }),
];
