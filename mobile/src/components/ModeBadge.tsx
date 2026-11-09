import { Badge } from '@/components/ui/Badge';
import type { IconName } from '@/constants/indicators';
import { modePalette } from '@/constants/theme';
import { tr, useUiLanguage } from '@/i18n';
import type { FallbackReason, InferenceMode, Localized } from '@/types/security';

export const MODE_LABEL: Record<InferenceMode, Localized> = {
  CLOUD_API: { en: 'Cloud AI', az: 'Bulud AI' },
  ON_DEVICE: { en: 'On-device LLM', az: 'Cihazda LLM' },
  DETERMINISTIC_ENGINE: { en: 'Deterministic engine', az: 'Deterministik mühərrik' },
};

export const MODE_ICON: Record<InferenceMode, IconName> = {
  CLOUD_API: 'cloud-outline',
  ON_DEVICE: 'hardware-chip-outline',
  DETERMINISTIC_ENGINE: 'git-network-outline',
};

/** Badge showing which inference mode produced a result. */
export function ModeBadge({ mode, suffix }: { mode: InferenceMode; suffix?: string }) {
  const lang = useUiLanguage();
  const label = suffix ? `${tr(MODE_LABEL[mode], lang)} · ${suffix}` : tr(MODE_LABEL[mode], lang);
  return <Badge label={label} icon={MODE_ICON[mode]} palette={modePalette[mode]} caps />;
}

/** Human explanation of why the router used a different mode than requested. */
export const FALLBACK_LABEL: Record<FallbackReason, Localized> = {
  ON_DEVICE_UNAVAILABLE: {
    en: 'The on-device LLM needs a native development build and is not available in Expo Go. The offline deterministic engine was used instead.',
    az: 'Cihazdaxili LLM üçün native development build lazımdır, Expo Go-da işləmir. Əvəzinə oflayn deterministik mühərrik istifadə olundu.',
  },
  SERVER_UNREACHABLE: {
    en: 'The DaCy server is not reachable. The offline deterministic engine was used instead.',
    az: 'DaCy serverinə qoşulmaq mümkün olmadı. Əvəzinə oflayn deterministik mühərrik istifadə olundu.',
  },
  AI_NOT_CONFIGURED: {
    en: 'Cloud AI is not configured on the server (no API key). The deterministic engine result is shown.',
    az: 'Serverdə bulud AI qurulmayıb (API açarı yoxdur). Deterministik mühərrikin nəticəsi göstərilir.',
  },
  AI_TIMEOUT: {
    en: 'Cloud AI did not answer in time. The deterministic engine result is shown.',
    az: 'Bulud AI vaxtında cavab vermədi. Deterministik mühərrikin nəticəsi göstərilir.',
  },
  AI_ERROR: {
    en: 'Cloud AI returned an error. The deterministic engine result is shown.',
    az: 'Bulud AI xəta qaytardı. Deterministik mühərrikin nəticəsi göstərilir.',
  },
  AI_REFUSED: {
    en: 'Cloud AI declined this request. The deterministic engine result is shown.',
    az: 'Bulud AI bu sorğunu rədd etdi. Deterministik mühərrikin nəticəsi göstərilir.',
  },
};
