/**
 * Resolves the DaCy server base URL.
 *
 * Priority:
 *  1. Manual override from Settings (e.g. a tunnel URL or http://<mac-ip>:8787).
 *  2. EXPO_PUBLIC_DACY_SERVER_URL (set in mobile/.env).
 *  3. The Expo dev server itself + "/dacy-api": metro.config.js proxies those
 *     requests to the DaCy server on the developer's computer. This works on the
 *     same Wi-Fi and through `expo start --tunnel`.
 *  4. Web: the page origin + "/dacy-api".
 *  5. http://localhost:8787
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { SERVER_PORT } from './contract';

export const DEV_API_PREFIX = '/dacy-api';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** host[:port] of the Metro dev server that served this bundle, if known. */
export function getDevHostUri(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? null;
  if (hostUri) {
    const host = hostUri.split('/')[0] ?? '';
    if (host) return host;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.host) {
    return window.location.host;
  }
  return null;
}

export function resolveServerUrl(override: string): string {
  const manual = override.trim();
  if (manual) return stripTrailingSlash(/^https?:\/\//i.test(manual) ? manual : `http://${manual}`);

  const fromEnv = process.env.EXPO_PUBLIC_DACY_SERVER_URL;
  if (fromEnv && fromEnv.trim()) return stripTrailingSlash(fromEnv.trim());

  const hostUri = getDevHostUri();
  if (hostUri) {
    const host = hostUri.split(':')[0] ?? '';
    // Local addresses use plain http; tunnel hosts (*.exp.direct, *.on.expo.app, …) are https-only
    // and redirect http with 301, which would turn POST requests into GETs.
    const isLocal = host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.endsWith('.local');
    const webSecure = Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.protocol === 'https:';
    const scheme = webSecure || !isLocal ? 'https' : 'http';
    return `${scheme}://${hostUri}${DEV_API_PREFIX}`;
  }

  return `http://localhost:${SERVER_PORT}`;
}
