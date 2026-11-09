/**
 * Engine regression cases (TEST DATA ONLY — not shipped in the app; the app
 * analyses real messages and calls only). Text messages and call transcripts in
 * English and Azerbaijani. Every scam uses the FICTIONAL brand "DemoBank"
 * (official domain demobank.az) or other fictional names — never a real bank.
 *
 * `expectedBand` is what the deterministic engine produces WITHOUT any AI
 * input, in both languages; tests/riskEngine.test.ts enforces this.
 */
import type { IndicatorType, Localized, RiskBand } from '@/types/security';

export interface EngineCase {
  id: string;
  kind: 'text' | 'voice';
  group: 'suspicious' | 'benign' | 'ambiguous';
  title: Localized;
  /** The same message / transcript in English and Azerbaijani. */
  text: Localized;
  expectedBand: RiskBand;
  /** Indicator types the scenario is meant to demonstrate. */
  tags: IndicatorType[];
}

export const ENGINE_CASES: EngineCase[] = [
  /* ---------------------------------------------------------------- */
  /* Text messages — suspicious                                        */
  /* ---------------------------------------------------------------- */
  {
    id: 'text-fake-bank-otp',
    kind: 'text',
    group: 'suspicious',
    title: { en: 'Fake bank: card blocked, send the code', az: 'Saxta bank: kart bloklanıb, kodu göndərin' },
    text: {
      en: 'DemoBank: Your card has been temporarily blocked due to suspicious activity. To unblock it, reply with the 6-digit code we have just sent you within 10 minutes, or confirm your details at https://demobank-az.top/verify',
      az: 'DemoBank: Şübhəli əməliyyat səbəbindən kartınız müvəqqəti bloklanıb. Kartı blokdan çıxarmaq üçün sizə göndərdiyimiz 6 rəqəmli kodu 10 dəqiqə ərzində cavab olaraq yazın və ya məlumatlarınızı https://demobank-az.top/verify ünvanında təsdiqləyin.',
    },
    expectedBand: 'critical',
    tags: ['THREAT_OR_FEAR', 'OTP_REQUEST', 'URGENCY', 'CREDENTIAL_REQUEST', 'SUSPICIOUS_URL'],
  },
  {
    id: 'text-relative-new-number',
    kind: 'text',
    group: 'suspicious',
    title: { en: '“Mom, this is my new number”', az: '“Ana, bu mənim yeni nömrəmdir”' },
    text: {
      en: "Mom, it's me. My phone broke, so this is my new number — save it. I'm in trouble and need 500 AZN urgently. Please send it to this card: 4111 1111 1111 1111. Don't tell dad, I'll explain everything later.",
      az: 'Ana, mənəm. Telefonum sınıb, bu mənim yeni nömrəmdir — yadda saxla. Başım bəlaya düşüb, təcili 500 AZN lazımdır. Xahiş edirəm, bu karta göndər: 4111 1111 1111 1111. Atama demə, sonra hər şeyi izah edəcəm.',
    },
    expectedBand: 'critical',
    tags: ['FAMILY_EMERGENCY', 'NEW_CONTACT_CHANNEL', 'MONEY_TRANSFER_REQUEST', 'URGENCY', 'SECRECY'],
  },
  {
    id: 'text-customs-fee',
    kind: 'text',
    group: 'suspicious',
    title: { en: 'Parcel held at customs: small fee', az: 'Bağlama gömrükdədir: kiçik ödəniş' },
    text: {
      en: 'DemoPost: Your parcel is being held at customs. To release it, pay the 1.85 AZN customs fee within 24 hours at demopost-delivery.top/pay, otherwise the parcel will be returned to the sender.',
      az: 'DemoPost: Bağlamanız gömrükdə saxlanılıb. Onu almaq üçün 24 saat ərzində 1.85 AZN gömrük rüsumunu demopost-delivery.top/pay ünvanında ödəyin, əks halda bağlama göndərənə qaytarılacaq.',
    },
    expectedBand: 'high',
    tags: ['AUTHORITY_IMPERSONATION', 'UPFRONT_FEE', 'URGENCY', 'THREAT_OR_FEAR', 'SUSPICIOUS_URL'],
  },
  {
    id: 'text-crypto-investment',
    kind: 'text',
    group: 'suspicious',
    title: { en: 'Crypto bot with guaranteed profit', az: 'Zəmanətli gəlirli kripto bot' },
    text: {
      en: "Hi! I'm Aysel, a crypto trader. With our trading bot you get a guaranteed profit of 30% per month with zero risk. The minimum deposit is only 200 AZN. Only 5 places left today — write to me on Telegram: @aysel_crypto_pro",
      az: 'Salam! Mən Ayselam, kripto treyderəm. Ticarət botumuzla ayda 30% zəmanətli gəlir əldə edirsiniz, heç bir risk yoxdur. Minimum depozit cəmi 200 AZN-dir. Bu gün cəmi 5 yer qalıb — Telegram-da mənə yazın: @aysel_crypto_pro',
    },
    expectedBand: 'high',
    tags: ['INVESTMENT_LURE', 'MONEY_TRANSFER_REQUEST', 'URGENCY', 'NEW_CONTACT_CHANNEL'],
  },
  {
    id: 'text-prize-lottery',
    kind: 'text',
    group: 'suspicious',
    title: { en: '“You won an iPhone”', az: '“Siz iPhone qazandınız”' },
    text: {
      en: 'Congratulations! Your number has won an iPhone 17 Pro in our anniversary lottery. To receive your prize, pay only 2.50 AZN for delivery within 24 hours: lucky-gift.xyz/claim',
      az: 'Təbrik edirik! Nömrəniz yubiley lotereyamızda iPhone 17 Pro qazandı. Hədiyyəni almaq üçün 24 saat ərzində çatdırılma haqqı olaraq cəmi 2.50 AZN ödəyin: lucky-gift.xyz/claim',
    },
    expectedBand: 'high',
    tags: ['PRIZE_LURE', 'UPFRONT_FEE', 'URGENCY', 'SUSPICIOUS_URL'],
  },
  {
    id: 'text-marketplace-buyer',
    kind: 'text',
    group: 'suspicious',
    title: { en: 'Marketplace “buyer” wants your card', az: 'Elan saytında “alıcı” kart məlumatı istəyir' },
    text: {
      en: "Hello! I want to buy the sofa from your DemoMarket ad. I've already paid via the site's safe delivery service. To receive the money, send me your card number, expiry date and the 3 digits on the back, then tell me the code that comes by SMS. Please be quick, the courier is waiting.",
      az: 'Salam! DemoMarket-dəki elanınızdakı divanı almaq istəyirəm. Ödənişi artıq saytın təhlükəsiz çatdırılma xidməti ilə etmişəm. Pulu almaq üçün kartınızın nömrəsini, son istifadə tarixini və arxasındakı 3 rəqəmi yazın, sonra SMS ilə gələn kodu deyin. Tez olun, kuryer gözləyir.',
    },
    expectedBand: 'critical',
    tags: ['CARD_DATA_REQUEST', 'OTP_REQUEST', 'URGENCY'],
  },
  {
    id: 'text-police-safe-account',
    kind: 'text',
    group: 'suspicious',
    title: { en: 'Fake police: move money to a “safe account”', az: 'Saxta polis: pulu “təhlükəsiz hesab”a köçürün' },
    text: {
      en: 'This is the Cybercrime Department of the Police. Criminals are using your DemoBank account. To protect your savings, transfer them immediately to a temporary safe account: AZ00DEMO00000000001234567890. This is a confidential investigation — do not tell the bank staff.',
      az: 'Polisin Kibercinayətkarlıqla Mübarizə İdarəsindən yazırıq. DemoBank-dakı hesabınızdan cinayətkarlar istifadə edir. Əmanətinizi qorumaq üçün onu dərhal müvəqqəti təhlükəsiz hesaba köçürün: AZ00DEMO00000000001234567890. Bu, məxfi istintaqdır — bank əməkdaşlarına heç nə deməyin.',
    },
    expectedBand: 'critical',
    tags: ['AUTHORITY_IMPERSONATION', 'THREAT_OR_FEAR', 'SAFE_ACCOUNT_TRANSFER', 'MONEY_TRANSFER_REQUEST', 'URGENCY', 'SECRECY'],
  },
  {
    id: 'text-anydesk-support',
    kind: 'text',
    group: 'suspicious',
    title: { en: '“Bank support”: install AnyDesk', az: '“Bank dəstəyi”: AnyDesk yükləyin' },
    text: {
      en: 'DemoBank Security Service: we detected an unauthorized login to your online banking. To protect your account, install AnyDesk from the Play Store and send us the 9-digit ID. Do it within 15 minutes, otherwise your account will be blocked.',
      az: 'DemoBank Təhlükəsizlik Xidməti: internet bankçılığınıza icazəsiz giriş aşkarlandı. Hesabınızı qorumaq üçün Play Store-dan AnyDesk proqramını yükləyin və 9 rəqəmli ID-ni bizə göndərin. Bunu 15 dəqiqə ərzində edin, əks halda hesabınız bloklanacaq.',
    },
    expectedBand: 'critical',
    tags: ['AUTHORITY_IMPERSONATION', 'THREAT_OR_FEAR', 'REMOTE_ACCESS_REQUEST', 'URGENCY'],
  },

  /* ---------------------------------------------------------------- */
  /* Text messages — benign / ambiguous                                */
  /* ---------------------------------------------------------------- */
  {
    id: 'text-university-meeting',
    kind: 'text',
    group: 'benign',
    title: { en: 'University seminar moved', az: 'Universitet seminarı başqa vaxta keçirildi' },
    text: {
      en: "Hi everyone! Tomorrow's thesis seminar is moved to 14:00 in room 305 of the main building. Please bring a printed draft of your chapter. See you there!",
      az: 'Hamıya salam! Sabahkı diplom seminarı saat 14:00-a, əsas binanın 305 nömrəli otağına keçirildi. Zəhmət olmasa, fəslinizin çap olunmuş qaralamasını gətirin. Görüşərik!',
    },
    expectedBand: 'low',
    tags: [],
  },
  {
    id: 'text-family-dinner',
    kind: 'text',
    group: 'benign',
    title: { en: 'Family dinner', az: 'Ailə şam yeməyi' },
    text: {
      en: "Mom says dinner is at 7 tonight at grandma's. Can you pick up some bread and tomatoes on the way home? See you!",
      az: 'Anam deyir ki, bu axşam saat 7-də nənəmgildə şam yeməyidir. Evə gələndə yoldan çörək və pomidor ala bilərsən? Görüşərik!',
    },
    expectedBand: 'low',
    tags: [],
  },
  {
    id: 'text-real-bank-otp',
    kind: 'text',
    group: 'benign',
    title: { en: 'Real DemoBank code notice', az: 'DemoBank-ın real kod bildirişi' },
    text: {
      en: 'DemoBank: 482913 is your confirmation code for a 45.90 AZN payment at DEMO MARKET. Never share this code with anyone, including bank employees.',
      az: 'DemoBank: DEMO MARKET-də 45.90 AZN məbləğində ödənişin təsdiq kodu: 482913. Bu kodu heç kimə, o cümlədən bank əməkdaşlarına deməyin.',
    },
    expectedBand: 'low',
    tags: ['PROTECTIVE_ADVICE'],
  },
  {
    id: 'text-shortened-photos',
    kind: 'text',
    group: 'ambiguous',
    title: { en: 'Shortened link “with photos”', az: '“Şəkillər” olan qısaldılmış link' },
    text: {
      en: "Hey! I uploaded the photos from Saturday's trip here: bit.ly/3Kx9TrQ — the link expires tonight, so have a look :)",
      az: 'Salam! Şənbə günkü səfərin şəkillərini bura yüklədim: bit.ly/3Kx9TrQ — linkin müddəti bu gecə bitir, tez bax :)',
    },
    expectedBand: 'moderate',
    tags: ['SUSPICIOUS_URL', 'URGENCY'],
  },
  {
    id: 'text-colleague-callback',
    kind: 'text',
    group: 'ambiguous',
    title: { en: 'Colleague: “call me back urgently”', az: 'Həmkar: “təcili zəng et”' },
    text: {
      en: "Hi, it's Leyla from the office. Please call me back urgently when you see this — it's about tomorrow's presentation.",
      az: 'Salam, ofisdən Leyladır. Bunu görən kimi mənə təcili zəng et, sabahkı təqdimatla bağlıdır.',
    },
    expectedBand: 'low',
    tags: ['URGENCY'],
  },

  /* ---------------------------------------------------------------- */
  /* Voice (call transcripts)                                          */
  /* ---------------------------------------------------------------- */
  {
    id: 'voice-bank-security-otp',
    kind: 'voice',
    group: 'suspicious',
    title: { en: '“Bank security” asks for the SMS code', az: '“Bankın təhlükəsizlik şöbəsi” SMS kodunu istəyir' },
    text: {
      en: 'Hello, this is the DemoBank security department. Right now someone is trying to withdraw money from your card. To cancel the transaction, please tell me the code that has just come to you by SMS. Hurry, otherwise you will lose your money.',
      az: 'Salam, DemoBank-ın təhlükəsizlik şöbəsindən narahat edirəm. Hazırda kimsə kartınızdan pul çıxarmağa çalışır. Əməliyyatı ləğv etmək üçün sizə SMS ilə gələn kodu tez deyin, yoxsa pulunuzu itirəcəksiniz.',
    },
    expectedBand: 'critical',
    tags: ['AUTHORITY_IMPERSONATION', 'THREAT_OR_FEAR', 'OTP_REQUEST', 'URGENCY'],
  },
  {
    id: 'voice-relative-emergency',
    kind: 'voice',
    group: 'suspicious',
    title: { en: '“Mom, it\'s me — send money”', az: '“Ana, mənəm — pul göndər”' },
    text: {
      en: "Mom, it's me! My phone broke, I'm calling from a friend's phone. I'm in big trouble — I urgently need 500 manat, please send it to this card right away. And please don't tell anyone, especially dad.",
      az: 'Ana, mənəm! Telefonum sınıb, dostumun telefonundan zəng edirəm. Başım bərk bəlaya düşüb, təcili 500 manat lazımdır, bu karta dərhal göndər. Xahiş edirəm, heç kimə demə, xüsusən də atama.',
    },
    expectedBand: 'critical',
    tags: ['FAMILY_EMERGENCY', 'NEW_CONTACT_CHANNEL', 'MONEY_TRANSFER_REQUEST', 'URGENCY', 'SECRECY'],
  },
  {
    id: 'voice-police-safe-account',
    kind: 'voice',
    group: 'suspicious',
    title: { en: '“Investigator”: safe-account story', az: '“Müstəntiq”: təhlükəsiz hesab hekayəsi' },
    text: {
      en: 'Good afternoon, I am investigator Huseynov from the police cybercrime department. Bank employees are trying to take out a loan in your name. To protect your savings, you need to transfer all the money from your account to a safe account today. This is a secret investigation, so do not tell anyone at the bank about this call.',
      az: 'Günortanız xeyir, mən polisin kibercinayətkarlıqla mübarizə idarəsindən müstəntiq Hüseynovam. Bankın əməkdaşları sizin adınıza kredit götürməyə çalışır. Əmanətinizi qorumaq üçün bu gün bütün pulu hesabınızdan təhlükəsiz hesaba köçürməlisiniz. Bu, gizli istintaqdır, ona görə də bu zəng barədə bankda heç kimə danışmayın.',
    },
    expectedBand: 'critical',
    tags: ['AUTHORITY_IMPERSONATION', 'THREAT_OR_FEAR', 'SAFE_ACCOUNT_TRANSFER', 'MONEY_TRANSFER_REQUEST', 'SECRECY'],
  },
  {
    id: 'voice-doctor-reminder',
    kind: 'voice',
    group: 'benign',
    title: { en: 'Clinic appointment reminder', az: 'Klinikadan qəbul xatırlatması' },
    text: {
      en: 'Hello, this is the DemoClinic family health center. We are calling to remind you about your appointment with Dr. Mammadova tomorrow at 10:30. If you cannot come, please let us know in advance. Have a nice day!',
      az: 'Salam, DemoClinic ailə sağlamlığı mərkəzindən zəng edirik. Sabah saat 10:30-da həkim Məmmədovanın qəbuluna yazıldığınızı xatırlatmaq istəyirik. Gələ bilməyəcəksinizsə, zəhmət olmasa, bizə əvvəlcədən xəbər verin. Gününüz xoş keçsin!',
    },
    expectedBand: 'low',
    tags: [],
  },
  {
    id: 'voice-bank-benign',
    kind: 'voice',
    group: 'benign',
    title: { en: 'Real bank call: “we never ask for codes”', az: 'Real bank zəngi: “biz heç vaxt kod soruşmuruq”' },
    text: {
      en: 'Good afternoon, this is DemoBank customer service. Your new debit card is ready — you can collect it at our Nizami branch from tomorrow. Please remember that we will never ask for your card details or the SMS code over the phone. Have a nice day!',
      az: 'Günortanız xeyir, DemoBank müştəri xidmətindən zəng edirik. Yeni debet kartınız hazırdır, sabahdan Nizami filialımızdan götürə bilərsiniz. Unutmayın: biz heç vaxt telefonla kart məlumatlarınızı və ya SMS ilə gələn kodu soruşmuruq. Gününüz xoş keçsin!',
    },
    expectedBand: 'low',
    tags: ['PROTECTIVE_ADVICE'],
  },
];
