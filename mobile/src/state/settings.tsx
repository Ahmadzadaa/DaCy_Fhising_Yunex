/**
 * App settings, persisted locally with AsyncStorage.
 * English is the default UI language (international jury); Azerbaijani is one tap away.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { InferenceMode, SpeechLanguage, UiLanguage } from '@/types/security';

export interface Settings {
  uiLanguage: UiLanguage;
  /** Language hint for speech-to-text (live guard + voice lab). */
  speechLanguage: SpeechLanguage;
  /** Requested inference mode; the router falls back when it is unavailable. */
  inferenceMode: InferenceMode;
  /** Manual server URL override (e.g. a tunnel URL). Empty = auto-detect from the Expo dev host. */
  serverUrlOverride: string;
  /** Keep (redacted) message text in local history. Calls never store transcripts. */
  storeTextInHistory: boolean;
  /** Speak warnings out loud during the live call guard. */
  spokenWarnings: boolean;
  /** Ask the server to inspect links in its isolated fetcher. */
  serverLinkInspection: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  uiLanguage: 'en',
  speechLanguage: 'en',
  inferenceMode: 'CLOUD_API',
  serverUrlOverride: '',
  storeTextInHistory: true,
  spokenWarnings: true,
  serverLinkInspection: true,
};

const STORAGE_KEY = 'dacy.settings.v1';

interface SettingsContextValue {
  settings: Settings;
  /** False until persisted settings were loaded (avoids a flash of defaults). */
  loaded: boolean;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function sanitize(raw: unknown): Settings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const pick = <K extends keyof Settings>(key: K, valid: (v: unknown) => boolean): Settings[K] =>
    (valid(value[key]) ? value[key] : DEFAULT_SETTINGS[key]) as Settings[K];
  return {
    uiLanguage: pick('uiLanguage', (v) => v === 'en' || v === 'az'),
    speechLanguage: pick('speechLanguage', (v) => v === 'en' || v === 'az' || v === 'auto'),
    inferenceMode: pick('inferenceMode', (v) => v === 'ON_DEVICE' || v === 'CLOUD_API' || v === 'DETERMINISTIC_ENGINE'),
    serverUrlOverride: pick('serverUrlOverride', (v) => typeof v === 'string'),
    storeTextInHistory: pick('storeTextInHistory', (v) => typeof v === 'boolean'),
    spokenWarnings: pick('spokenWarnings', (v) => typeof v === 'boolean'),
    serverLinkInspection: pick('serverLinkInspection', (v) => typeof v === 'boolean'),
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((json) => {
        if (cancelled) return;
        if (json) {
          try {
            setSettings(sanitize(JSON.parse(json)));
          } catch {
            setSettings(DEFAULT_SETTINGS);
          }
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: Settings) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = sanitize({ ...prev, ...patch });
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    persist(DEFAULT_SETTINGS);
  }, [persist]);

  const value = useMemo(() => ({ settings, loaded, update, reset }), [settings, loaded, update, reset]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
