import { useMemo } from 'react';

import type { ProviderContext } from '@/services/ai/modelProvider';
import { useServerStatus } from '@/state/serverStatus';
import { useSettings } from '@/state/settings';

/** Builds the inference-router context from settings + live server status. */
export function useProviderContext(): ProviderContext {
  const { settings } = useSettings();
  const { baseUrl, status, health } = useServerStatus();
  return useMemo(
    () => ({
      baseUrl,
      online: status === 'online',
      health,
      requestedMode: settings.inferenceMode,
      uiLanguage: settings.uiLanguage,
      speechLanguage: settings.speechLanguage,
      serverLinkInspection: settings.serverLinkInspection,
    }),
    [baseUrl, status, health, settings.inferenceMode, settings.uiLanguage, settings.speechLanguage, settings.serverLinkInspection],
  );
}
