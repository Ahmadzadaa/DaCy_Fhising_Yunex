/**
 * DaCy Kids guidance for the guardian — shared by the on-device grooming engine
 * (services/security/groomingEngine.ts) and the guardian's own phone (Family tab
 * alert rows, banner, notification), which only ever receives the minimal alert
 * (band, category, app, time) and must still know what to do next.
 *
 * Pure data (no react-native imports): also runs in Node unit tests.
 */
import { INDICATOR_META } from '@/constants/indicators';
import type { AlertSourceKind, IndicatorType, Localized } from '@/types/security';
import { CHILD_SAFETY_TYPES } from '@/types/security';

/** General safeguarding steps, in the order a guardian should take them. */
export const GUARDIAN_GENERAL_ACTIONS = {
  noBlame: {
    en: 'Do not blame or punish your child — they are the target, not the one at fault. Do not take the phone away as a punishment.',
    az: 'Uşağınızı günahlandırmayın və cəzalandırmayın — o, hədəfdir, günahkar deyil. Telefonu cəza kimi əlindən almayın.',
  },
  evidence: {
    en: 'Keep the evidence: take screenshots of the profile and the messages before blocking. Do not delete the chat.',
    az: 'Sübutları saxlayın: bloklamazdan əvvəl profilin və mesajların ekran şəklini çəkin. Yazışmanı silməyin.',
  },
  report: {
    en: 'Report the account in the app. If there were requests for photos, a meeting or threats, contact the police.',
    az: 'Hesabı tətbiqin özündə şikayət edin. Şəkil, görüş tələbi və ya hədə olubsa, polisə müraciət edin.',
  },
  talk: {
    en: 'Talk with your child calmly and in private. Listen first and ask open questions.',
    az: 'Uşağınızla sakit və təkbətək danışın. Əvvəlcə dinləyin, açıq suallar verin.',
  },
  prevention: {
    en: 'No action needed. Keep talking with your child about their online friends.',
    az: 'Hələlik tədbir lazım deyil. Uşağınızla internetdəki dostları barədə danışmağa davam edin.',
  },
} satisfies Record<string, Localized>;

/**
 * Guardian-facing wording for general (non child-safety) indicators whose
 * catalogue text addresses an adult scam victim ("not to tell your bank …").
 * Child-safety indicators use INDICATOR_META as is.
 */
const CHILD_CONTEXT: Partial<Record<IndicatorType, { explain: Localized; action: Localized }>> = {
  SECRECY: {
    explain: {
      en: 'Asks the child to keep the chat secret from their parents or to delete it.',
      az: 'Uşaqdan yazışmanı valideynlərindən gizlətməyi və ya silməyi istəyir.',
    },
    action: {
      en: 'Tell your child that a real friend never asks them to keep secrets from their parents, and that they can always tell you.',
      az: 'Uşağınıza deyin ki, əsl dost heç vaxt valideynlərdən sirr saxlamağı istəməz və o, sizə həmişə hər şeyi danışa bilər.',
    },
  },
  NEW_CONTACT_CHANNEL: {
    explain: {
      en: 'Pushes the child to move to a more private app, where the chat is harder to see.',
      az: 'Uşağı yazışmanın daha çətin göründüyü, daha gizli tətbiqə keçməyə yönləndirir.',
    },
    action: {
      en: 'Ask which other apps your child uses with this person — the same contact may be active there too.',
      az: 'Uşağınızdan bu şəxslə başqa hansı tətbiqlərdə yazışdığını soruşun — eyni şəxs orada da ola bilər.',
    },
  },
  THREAT_OR_FEAR: {
    explain: {
      en: 'Uses threats or fear to pressure the child.',
      az: 'Uşağa təzyiq etmək üçün hədə və ya qorxutmadan istifadə edir.',
    },
    action: {
      en: 'Reassure your child that they are safe and not in trouble, then keep the evidence.',
      az: 'Uşağınızı arxayın edin ki, təhlükəsizdir və günahkar deyil, sonra sübutları saxlayın.',
    },
  },
};

/** Explanation of an indicator in the child-safety context. */
export function childContextExplain(type: IndicatorType): Localized {
  return CHILD_CONTEXT[type]?.explain ?? INDICATOR_META[type].explain;
}

/** Guardian action for an indicator in the child-safety context (null when the catalogue has none). */
export function childContextAction(type: IndicatorType): Localized | null {
  return CHILD_CONTEXT[type]?.action ?? INDICATOR_META[type].action;
}

/** True for alerts about a child's safety (DaCy Kids app alerts or a child-safety category). */
export function isChildSafetyAlert(alert: { category: IndicatorType; source: AlertSourceKind }): boolean {
  return alert.source === 'app' || CHILD_SAFETY_TYPES.includes(alert.category);
}

/**
 * Static next steps for a child-safety alert on the guardian's phone (the alert has
 * no message content): don't blame → keep evidence → the category's own action
 * (e.g. "do not pay" for sextortion) → report.
 */
export function guardianAlertGuidance(category: IndicatorType): Localized[] {
  const out: Localized[] = [GUARDIAN_GENERAL_ACTIONS.noBlame, GUARDIAN_GENERAL_ACTIONS.evidence];
  const action = childContextAction(category);
  if (action) out.push(action);
  out.push(GUARDIAN_GENERAL_ACTIONS.report);
  return out;
}
