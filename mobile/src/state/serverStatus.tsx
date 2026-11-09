/**
 * Tracks reachability and capabilities of the DaCy server (GET /health).
 * Polls every 20 s while the app is in the foreground and on demand.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { getHealth } from '@/services/api/client';
import type { HealthResponse } from '@/services/api/contract';
import { resolveServerUrl } from '@/services/api/serverUrl';
import { useSettings } from '@/state/settings';

export type ServerReachability = 'checking' | 'online' | 'offline';

interface ServerStatusValue {
  baseUrl: string;
  status: ServerReachability;
  health: HealthResponse | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  refresh: () => Promise<boolean>;
}

const ServerStatusContext = createContext<ServerStatusValue | null>(null);
const POLL_MS = 20_000;

export function ServerStatusProvider({ children }: { children: ReactNode }) {
  const { settings, loaded } = useSettings();
  const baseUrl = useMemo(() => resolveServerUrl(settings.serverUrlOverride), [settings.serverUrlOverride]);
  const [status, setStatus] = useState<ServerReachability>('checking');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const baseUrlRef = useRef(baseUrl);

  useEffect(() => {
    baseUrlRef.current = baseUrl;
  }, [baseUrl]);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    const target = baseUrlRef.current;
    const run = (async () => {
      const result = await getHealth(target);
      if (target !== baseUrlRef.current) return false; // URL changed meanwhile
      setLastCheckedAt(new Date().toISOString());
      if (result.ok && result.data?.ok) {
        setHealth(result.data);
        setStatus('online');
        setLastError(null);
        return true;
      }
      setHealth(null);
      setStatus('offline');
      setLastError(result.ok ? 'Unexpected /health response' : `${result.code}: ${result.message}`);
      return false;
    })();
    inFlight.current = run;
    try {
      return await run;
    } finally {
      inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setStatus('checking');
    void refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [loaded, baseUrl, refresh]);

  const value = useMemo(
    () => ({ baseUrl, status, health, lastCheckedAt, lastError, refresh }),
    [baseUrl, status, health, lastCheckedAt, lastError, refresh],
  );
  return <ServerStatusContext.Provider value={value}>{children}</ServerStatusContext.Provider>;
}

export function useServerStatus(): ServerStatusValue {
  const ctx = useContext(ServerStatusContext);
  if (!ctx) throw new Error('useServerStatus must be used inside <ServerStatusProvider>');
  return ctx;
}
