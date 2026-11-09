/**
 * Central catalogue of risk indicators: category, scoring weight, bilingual
 * labels/explanations/recommended actions and icon. Used by the deterministic
 * risk engine (weights) and by the UI (labels, icons).
 *
 * Weights are the points an indicator contributes at confidence 1.0.
 * The engine scales them by confidence, adds combination bonuses and clamps
 * the total to 0–100 (see services/security/riskEngine.ts).
 */
import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

import type {
  IndicatorCategory,
  IndicatorType,
  Localized,
  RiskBand,
  UrlSignalSeverity,
  UrlSignalType,
} from '@/types/security';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export interface IndicatorMeta {
  category: IndicatorCategory;
  /** Points at confidence 1.0 (negative = lowers risk). */
  weight: number;
  label: Localized;
  explain: Localized;
  action: Localized | null;
  icon: IconName;
}

export const INDICATOR_META: Record<IndicatorType, IndicatorMeta> = {
  OTP_REQUEST: {
    category: 'financial',
    weight: 45,
    icon: 'key-outline',
    label: { en: 'One-time code request', az: 'Birdəfəlik kod tələbi' },
    explain: {
      en: 'It asks you to share an SMS or verification code. Banks and real services never ask for these codes.',
      az: 'Sizdən SMS və ya təsdiq kodunu paylaşmağınız istənilir. Banklar və real xidmətlər bu kodları heç vaxt soruşmur.',
    },
    action: {
      en: 'Do not share any code. End the call or ignore the message, then call your bank on the number printed on your card.',
      az: 'Heç bir kodu paylaşmayın. Zəngi bitirin və ya mesaja cavab verməyin, sonra bankınıza kartın üzərindəki nömrə ilə özünüz zəng edin.',
    },
  },
  CARD_DATA_REQUEST: {
    category: 'financial',
    weight: 45,
    icon: 'card-outline',
    label: { en: 'Card details request', az: 'Kart məlumatı tələbi' },
    explain: {
      en: 'It asks for your card number, CVV, PIN or expiry date.',
      az: 'Kart nömrəsi, CVV, PIN və ya kartın son istifadə tarixi istənilir.',
    },
    action: {
      en: 'Never give card details by phone or message. If you already did, block the card in your bank app now.',
      az: 'Kart məlumatlarını heç vaxt telefonla və ya mesajla verməyin. Artıq vermisinizsə, kartı dərhal bank tətbiqində bloklayın.',
    },
  },
  CREDENTIAL_REQUEST: {
    category: 'financial',
    weight: 40,
    icon: 'lock-closed-outline',
    label: { en: 'Password or login request', az: 'Şifrə və ya giriş məlumatı tələbi' },
    explain: {
      en: 'It asks for a password or login details.',
      az: 'Şifrə və ya hesaba giriş məlumatları istənilir.',
    },
    action: {
      en: 'Never type a password on a page opened from a message. Open the official app yourself.',
      az: 'Mesajdan açılan səhifədə heç vaxt şifrə yazmayın. Rəsmi tətbiqi özünüz açın.',
    },
  },
  REMOTE_ACCESS_REQUEST: {
    category: 'technical',
    weight: 40,
    icon: 'desktop-outline',
    label: { en: 'Remote access request', az: 'Uzaqdan giriş tələbi' },
    explain: {
      en: 'It asks you to install a remote-control app (for example AnyDesk) or to share your screen.',
      az: 'Sizdən uzaqdan idarəetmə proqramı (məsələn, AnyDesk) quraşdırmağınız və ya ekranınızı paylaşmağınız istənilir.',
    },
    action: {
      en: 'Do not install anything and do not share your screen. If you installed such an app, delete it.',
      az: 'Heç nə quraşdırmayın və ekranınızı paylaşmayın. Belə proqram quraşdırmısınızsa, onu silin.',
    },
  },
  SAFE_ACCOUNT_TRANSFER: {
    category: 'financial',
    weight: 45,
    icon: 'swap-horizontal-outline',
    label: { en: '“Safe account” transfer', az: '“Təhlükəsiz hesab”a köçürmə' },
    explain: {
      en: 'It asks you to move money to a “safe” or “reserve” account — a classic bank or police impersonation scam.',
      az: 'Pulu “təhlükəsiz” və ya “ehtiyat” hesaba köçürməyiniz istənilir. Bu, bank və ya polis adından edilən klassik fırıldaqdır.',
    },
    action: {
      en: 'No bank or police officer will ever ask you to move money to protect it. Do not transfer anything.',
      az: 'Heç bir bank və ya polis pulunuzu qorumaq üçün onu köçürməyinizi istəməz. Heç bir köçürmə etməyin.',
    },
  },
  MONEY_TRANSFER_REQUEST: {
    category: 'financial',
    weight: 30,
    icon: 'cash-outline',
    label: { en: 'Money transfer request', az: 'Pul köçürmə tələbi' },
    explain: {
      en: 'It asks you to send or transfer money.',
      az: 'Sizdən pul göndərməyiniz və ya köçürməyiniz istənilir.',
    },
    action: {
      en: 'Pause. Confirm the request through a second, known channel before sending any money.',
      az: 'Dayanın. Pul göndərməzdən əvvəl tələbi başqa, tanış bir yolla təsdiqləyin.',
    },
  },
  UPFRONT_FEE: {
    category: 'financial',
    weight: 20,
    icon: 'pricetag-outline',
    label: { en: 'Small upfront fee', az: 'Əvvəlcədən kiçik ödəniş' },
    explain: {
      en: 'It asks for a small fee (delivery, customs, unlocking) — a common hook to steal card details.',
      az: 'Kiçik ödəniş tələb olunur (çatdırılma, gömrük, blokdan çıxarma). Bu, kart məlumatını oğurlamaq üçün geniş yayılmış tələdir.',
    },
    action: {
      en: 'Check the parcel or payment only in the official app or website that you open yourself.',
      az: 'Bağlamanı və ya ödənişi yalnız özünüz açdığınız rəsmi tətbiq və ya saytda yoxlayın.',
    },
  },
  INVESTMENT_LURE: {
    category: 'financial',
    weight: 25,
    icon: 'trending-up-outline',
    label: { en: 'Investment lure', az: 'İnvestisiya tələsi' },
    explain: {
      en: 'It promises guaranteed or unusually high returns.',
      az: 'Zəmanətli və ya qeyri-adi yüksək gəlir vəd edilir.',
    },
    action: {
      en: 'Guaranteed high profit does not exist. Check whether the company is licensed by the Central Bank.',
      az: 'Zəmanətli yüksək gəlir olmur. Şirkətin Mərkəzi Bankın lisenziyasına malik olub-olmadığını yoxlayın.',
    },
  },
  PRIZE_LURE: {
    category: 'psychological',
    weight: 15,
    icon: 'gift-outline',
    label: { en: 'Prize or gift lure', az: 'Uduş və ya hədiyyə tələsi' },
    explain: {
      en: 'It claims you won a prize, bonus or gift.',
      az: 'Uduş, bonus və ya hədiyyə qazandığınız iddia edilir.',
    },
    action: {
      en: 'You cannot win a contest you never entered. Do not pay or share data to “claim” it.',
      az: 'İştirak etmədiyiniz yarışda qalib gələ bilməzsiniz. “Almaq” üçün ödəniş etməyin və məlumat verməyin.',
    },
  },
  URGENCY: {
    category: 'psychological',
    weight: 15,
    icon: 'timer-outline',
    label: { en: 'Time pressure', az: 'Vaxt təzyiqi' },
    explain: {
      en: 'It pushes you to act immediately so you have no time to think.',
      az: 'Düşünməyə vaxtınız olmasın deyə sizi dərhal hərəkət etməyə məcbur edir.',
    },
    action: {
      en: 'Slow down. Real organisations always give you time to verify.',
      az: 'Tələsməyin. Real təşkilatlar həmişə yoxlamağa vaxt verir.',
    },
  },
  SECRECY: {
    category: 'psychological',
    weight: 20,
    icon: 'eye-off-outline',
    label: { en: 'Secrecy pressure', az: 'Gizlilik təzyiqi' },
    explain: {
      en: 'It asks you not to tell your family, your bank or anyone else.',
      az: 'Ailənizə, banka və ya başqa birinə deməməyiniz istənilir.',
    },
    action: {
      en: 'Tell someone you trust right now. Scammers need you to stay silent.',
      az: 'Etibar etdiyiniz birinə indi danışın. Fırıldaqçıya sizin susmağınız lazımdır.',
    },
  },
  AUTHORITY_IMPERSONATION: {
    category: 'psychological',
    weight: 15,
    icon: 'business-outline',
    label: { en: 'Claims to be an authority', az: 'Rəsmi qurum adından danışma' },
    explain: {
      en: 'It claims to be a bank, police, court, customs or another official body.',
      az: 'Bank, polis, məhkəmə, gömrük və ya başqa rəsmi qurum adından danışılır.',
    },
    action: {
      en: 'End the call and contact the organisation yourself on its official number.',
      az: 'Zəngi bitirin və quruma onun rəsmi nömrəsi ilə özünüz zəng edin.',
    },
  },
  FAMILY_EMERGENCY: {
    category: 'psychological',
    weight: 20,
    icon: 'people-outline',
    label: { en: 'Relative-in-trouble story', az: 'Qohum adından təcili hal' },
    explain: {
      en: 'Someone claims to be a relative in trouble (new number, broken phone, accident).',
      az: 'Kimsə çətin vəziyyətə düşmüş qohumunuz kimi təqdim olunur (yeni nömrə, sınmış telefon, qəza).',
    },
    action: {
      en: 'Call your relative back on their usual number, or ask a question only they would know.',
      az: 'Qohumunuza onun həmişəki nömrəsi ilə zəng edin və ya yalnız onun bildiyi bir sual verin.',
    },
  },
  THREAT_OR_FEAR: {
    category: 'psychological',
    weight: 15,
    icon: 'warning-outline',
    label: { en: 'Threat or fear', az: 'Hədə və ya qorxutma' },
    explain: {
      en: 'It threatens blocking, fines, arrest or legal action.',
      az: 'Bloklama, cərimə, həbs və ya məhkəmə ilə hədələyir.',
    },
    action: {
      en: 'Threats are a pressure tactic. Verify independently before you do anything.',
      az: 'Hədə təzyiq üsuludur. Heç nə etməzdən əvvəl müstəqil şəkildə yoxlayın.',
    },
  },
  NEW_CONTACT_CHANNEL: {
    category: 'psychological',
    weight: 10,
    icon: 'chatbubbles-outline',
    label: { en: 'New number or channel', az: 'Yeni nömrə və ya kanal' },
    explain: {
      en: 'It asks you to continue on a new number or in another app.',
      az: 'Söhbəti yeni nömrədə və ya başqa tətbiqdə davam etdirməyiniz istənilir.',
    },
    action: {
      en: 'First confirm the person on their old, known number.',
      az: 'Əvvəlcə şəxsi köhnə, tanış nömrəsi ilə yoxlayın.',
    },
  },
  SUSPICIOUS_URL: {
    category: 'technical',
    // Variable: derived from the link severity (see URL_SEVERITY_POINTS).
    weight: 0,
    icon: 'link-outline',
    label: { en: 'Suspicious link', az: 'Şübhəli link' },
    explain: {
      en: 'The link shows signs of a phishing website.',
      az: 'Linkdə fişinq saytının əlamətləri var.',
    },
    action: {
      en: 'Do not open the link. Type the official address yourself or use the official app.',
      az: 'Linki açmayın. Rəsmi ünvanı özünüz yazın və ya rəsmi tətbiqdən istifadə edin.',
    },
  },
  PROTECTIVE_ADVICE: {
    category: 'protective',
    weight: -15,
    icon: 'shield-checkmark-outline',
    label: { en: 'Safety advice (benign)', az: 'Təhlükəsizlik məsləhəti (zərərsiz)' },
    explain: {
      en: 'It contains standard safety advice such as “never share your code”.',
      az: 'Mətndə “kodu heç kimə deməyin” kimi standart təhlükəsizlik məsləhəti var.',
    },
    action: null,
  },
  TRUST_GROOMING: {
    category: 'child_safety',
    weight: 12,
    icon: 'heart-dislike-outline',
    label: { en: 'Excessive trust-building', az: 'Həddindən artıq etibar qazanma' },
    explain: {
      en: 'An adult or stranger builds unusual closeness: “only I understand you”, “you are so mature for your age”.',
      az: 'Yad və ya böyük biri qeyri-adi yaxınlıq qurur: “səni ancaq mən başa düşürəm”, “yaşına görə çox yetkinsən”.',
    },
    action: {
      en: 'Talk calmly with your child about who this person is. Do not confront the contact yet.',
      az: 'Uşağınızla bu şəxsin kim olduğu barədə sakit danışın. Hələlik həmin şəxslə qarşıdurmaya girməyin.',
    },
  },
  PERSONAL_INFO_PROBE: {
    category: 'child_safety',
    weight: 15,
    icon: 'location-outline',
    label: { en: 'Probing for personal details', az: 'Şəxsi məlumatları öyrənmək cəhdi' },
    explain: {
      en: 'Asks for age, school, address, or whether the child is home alone or unsupervised.',
      az: 'Yaş, məktəb, ünvan və ya uşağın evdə tək olub-olmadığını soruşur.',
    },
    action: {
      en: 'Remind your child never to share address, school or when they are alone.',
      az: 'Uşağınıza ünvanını, məktəbini və nə vaxt tək qaldığını heç kimə deməməyi xatırladın.',
    },
  },
  GIFT_GROOMING: {
    category: 'child_safety',
    weight: 15,
    icon: 'gift-outline',
    label: { en: 'Gifts or game currency offered', az: 'Hədiyyə və ya oyun pulu təklifi' },
    explain: {
      en: 'Offers gifts, gift cards or game currency (e.g. Robux) — a common way to create a sense of debt.',
      az: 'Hədiyyə, hədiyyə kartı və ya oyun pulu (məsələn, Robux) təklif edir — “borclu” hissi yaratmağın geniş yayılmış üsulu.',
    },
    action: {
      en: 'Agree with your child that gifts from online strangers are always shown to you first.',
      az: 'Uşağınızla razılaşın ki, internetdəki yad şəxslərdən gələn hər hədiyyəni əvvəlcə sizə göstərsin.',
    },
  },
  PERSONAL_IMAGE_REQUEST: {
    category: 'child_safety',
    weight: 45,
    icon: 'camera-outline',
    label: { en: 'Request for personal photos', az: 'Şəxsi şəkil tələbi' },
    explain: {
      en: 'Asks the child to send photos or videos of themselves, especially private ones.',
      az: 'Uşaqdan özünün, xüsusən şəxsi şəkillərini və ya videolarını göndərməyi istəyir.',
    },
    action: {
      en: 'Talk with your child today. Make clear they are not in trouble. Do not delete the chat — it may be evidence.',
      az: 'Bu gün uşağınızla danışın. Onun günahkar olmadığını aydın deyin. Yazışmanı silməyin — sübut ola bilər.',
    },
  },
  MEETING_REQUEST: {
    category: 'child_safety',
    weight: 35,
    icon: 'walk-outline',
    label: { en: 'Request to meet in person', az: 'Real görüş tələbi' },
    explain: {
      en: 'Asks to meet offline, often “alone” or “without telling anyone”.',
      az: 'Real həyatda, çox vaxt “tək” və ya “heç kimə demədən” görüşməyi təklif edir.',
    },
    action: {
      en: 'Make sure your child does not go to any meeting. Consider contacting the police.',
      az: 'Uşağınızın heç bir görüşə getmədiyindən əmin olun. Polisə müraciət etməyi düşünün.',
    },
  },
  SEXTORTION_THREAT: {
    category: 'child_safety',
    weight: 55,
    icon: 'alert-circle-outline',
    label: { en: 'Threat to share images (sextortion)', az: 'Şəkilləri yaymaqla hədə (şantaj)' },
    explain: {
      en: 'Threatens to share or post the child’s images unless they send more or pay.',
      az: 'Daha çox şəkil göndərməsə və ya pul ödəməsə, uşağın şəkillərini yaymaqla hədələyir.',
    },
    action: {
      en: 'Do not pay and do not send anything. Keep the evidence, report the account to the platform and contact the police.',
      az: 'Pul ödəməyin və heç nə göndərməyin. Sübutları saxlayın, hesabı platformaya bildirin və polisə müraciət edin.',
    },
  },
};

/** Points a SUSPICIOUS_URL indicator contributes, by the worst link severity. */
export const URL_SEVERITY_POINTS: Record<UrlSignalSeverity, number> = {
  info: 0,
  low: 10,
  medium: 22,
  high: 35,
};

export const URL_SIGNAL_LABEL: Record<UrlSignalType, Localized> = {
  URL_SHORTENER: { en: 'Shortened link hides the real address', az: 'Qısaldılmış link əsl ünvanı gizlədir' },
  IP_HOST: { en: 'Raw IP address instead of a domain', az: 'Domen əvəzinə IP ünvan' },
  PUNYCODE_OR_IDN: { en: 'Look-alike characters in the domain', az: 'Domendə oxşar simvollar' },
  BRAND_LOOKALIKE: { en: 'Imitates a known brand', az: 'Tanınmış brendi təqlid edir' },
  RISKY_TLD: { en: 'Domain ending often abused by scammers', az: 'Fırıldaqçıların tez-tez istifadə etdiyi domen sonluğu' },
  NO_HTTPS: { en: 'No HTTPS encryption', az: 'HTTPS şifrələməsi yoxdur' },
  CREDENTIALS_IN_URL: { en: 'Hidden user part before “@”', az: '“@” işarəsindən əvvəl gizli hissə' },
  EXCESSIVE_SUBDOMAINS: { en: 'Unusually many subdomains', az: 'Qeyri-adi sayda subdomen' },
  SUSPICIOUS_KEYWORDS: { en: 'Phishing keywords in the address', az: 'Ünvanda fişinq açar sözləri' },
  NEW_DOMAIN: { en: 'Very new domain', az: 'Çox yeni domen' },
  REDIRECT_CHAIN: { en: 'Several redirects', az: 'Bir neçə yönləndirmə' },
  CROSS_DOMAIN_REDIRECT: { en: 'Redirects to a different domain', az: 'Başqa domenə yönləndirir' },
  PASSWORD_FORM: { en: 'Page asks for a password', az: 'Səhifə şifrə istəyir' },
  CARD_FORM: { en: 'Page asks for card details', az: 'Səhifə kart məlumatı istəyir' },
  UNREACHABLE: { en: 'Could not be inspected', az: 'Yoxlamaq mümkün olmadı' },
  OFFICIAL_DOMAIN: { en: 'Matches an official domain', az: 'Rəsmi domenə uyğundur' },
};

export const CATEGORY_LABEL: Record<IndicatorCategory, Localized> = {
  financial: { en: 'Financial risk', az: 'Maliyyə riski' },
  psychological: { en: 'Psychological manipulation', az: 'Psixoloji manipulyasiya' },
  technical: { en: 'Technical risk', az: 'Texniki risk' },
  protective: { en: 'Protective signal', az: 'Qoruyucu siqnal' },
  child_safety: { en: 'Child safety risk', az: 'Uşaq təhlükəsizliyi riski' },
};

export interface BandMeta {
  label: Localized;
  short: Localized;
  lead: Localized;
  icon: IconName;
}

export const BAND_META: Record<RiskBand, BandMeta> = {
  low: {
    label: { en: 'Low risk', az: 'Aşağı risk' },
    short: { en: 'Low', az: 'Aşağı' },
    lead: {
      en: 'No strong scam signals were found in what was checked. This is not a guarantee of safety.',
      az: 'Yoxlanılan hissədə güclü fırıldaq əlaməti tapılmadı. Bu, təhlükəsizlik zəmanəti deyil.',
    },
    icon: 'shield-checkmark',
  },
  moderate: {
    label: { en: 'Moderate risk', az: 'Orta risk' },
    short: { en: 'Moderate', az: 'Orta' },
    lead: {
      en: 'Some signals need checking before you act.',
      az: 'Hərəkət etməzdən əvvəl yoxlanılmalı bəzi əlamətlər var.',
    },
    icon: 'alert-circle',
  },
  high: {
    label: { en: 'High risk', az: 'Yüksək risk' },
    short: { en: 'High', az: 'Yüksək' },
    lead: {
      en: 'Several typical scam signals were found.',
      az: 'Bir neçə tipik fırıldaq əlaməti tapıldı.',
    },
    icon: 'warning',
  },
  critical: {
    label: { en: 'Critical threat', az: 'Kritik təhlükə' },
    short: { en: 'Critical', az: 'Kritik' },
    lead: {
      en: 'This matches the pattern of a scam. Stop and do not share anything.',
      az: 'Bu, fırıldaq ssenarisinə uyğundur. Dayanın və heç nə paylaşmayın.',
    },
    icon: 'skull',
  },
};
