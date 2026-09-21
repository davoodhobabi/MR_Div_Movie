import { Platform } from 'react-native';

export const WEB_DEV_PROXY_PORT = 8787;

/** Same-origin (or local sidecar in Expo web) helper for catalog hosts that lack CORS. */
export function webCatalogApiUrl(path: string, targetUrl: string): string {
  const rel = `${path}?url=${encodeURIComponent(targetUrl)}`;
  if (Platform.OS !== 'web') return rel;
  if (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    typeof window !== 'undefined'
  ) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${WEB_DEV_PROXY_PORT}${rel}`;
  }
  return rel;
}
