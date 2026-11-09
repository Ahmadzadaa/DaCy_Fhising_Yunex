/**
 * Tiny, type-safe i18n for two UI languages (English default, Azerbaijani).
 *
 * Usage inside a component:
 *
 *   const S = defineStrings({
 *     en: { title: 'Check a message', count: '{n} scans' },
 *     az: { title: 'Mesajı yoxla', count: '{n} yoxlama' },
 *   });
 *   const t = useStrings(S);
 *   t.title;                     // current language
 *   fmt(t.count, { n: 3 });      // interpolation
 *
 * `defineStrings` forces the Azerbaijani table to have exactly the same keys
 * as the English one, so a missing translation is a compile error.
 */
import { useSettings } from '@/state/settings';
import type { Localized, UiLanguage } from '@/types/security';

export type StringTable = Record<string, string>;

export interface StringBundle<T extends StringTable> {
  en: T;
  az: { [K in keyof T]: string };
}

export function defineStrings<T extends StringTable>(bundle: {
  en: T;
  az: { [K in keyof T]: string };
}): StringBundle<T> {
  return bundle;
}

/** Returns the string table for the current UI language. */
export function useStrings<T extends StringTable>(bundle: StringBundle<T>): { [K in keyof T]: string } {
  const { settings } = useSettings();
  return settings.uiLanguage === 'az' ? bundle.az : bundle.en;
}

/** Current UI language. */
export function useUiLanguage(): UiLanguage {
  return useSettings().settings.uiLanguage;
}

/** Pick one side of a Localized pair. */
export function tr(value: Localized, lang: UiLanguage): string {
  return lang === 'az' ? value.az : value.en;
}

/** Hook version of `tr` bound to the current UI language. */
export function useTr(): (value: Localized) => string {
  const lang = useUiLanguage();
  return (value: Localized) => tr(value, lang);
}

/** Replace `{name}` placeholders. Unknown placeholders are left untouched. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

const AZ_MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "15:42" in local time. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "8 Nov, 15:42" / "8 noy, 15:42" — locale-independent so it renders identically everywhere. */
export function formatDateTime(iso: string, lang: UiLanguage): string {
  const d = new Date(iso);
  const month = (lang === 'az' ? AZ_MONTHS : EN_MONTHS)[d.getMonth()];
  return `${d.getDate()} ${month}, ${formatTime(iso)}`;
}

/** "just now", "5 min ago", "2 h ago", or a date. */
export function formatRelative(iso: string, lang: UiLanguage, now: number = Date.now()): string {
  const diffSec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (diffSec < 45) return lang === 'az' ? 'indicə' : 'just now';
  const min = Math.round(diffSec / 60);
  if (min < 60) return lang === 'az' ? `${min} dəq əvvəl` : `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return lang === 'az' ? `${h} saat əvvəl` : `${h} h ago`;
  return formatDateTime(iso, lang);
}

/** "0:07", "1:24" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${pad2(s)}`;
}
