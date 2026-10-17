import { Platform } from 'react-native';

export const WEB_DEV_PROXY_PORT = 8787;

/** Production Iran Node host that runs ffmpeg remux (must not go through Vercel). */
const IRAN_STREAM_ORIGIN = (
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_STREAM_ORIGIN
    ? process.env.EXPO_PUBLIC_STREAM_ORIGIN
    : 'http://movie.mr-div.ir'
).replace(/\/$/, '');

function isIranAppHost(hostname: string) {
  return (
    hostname === 'movie.mr-div.ir' ||
    hostname === 'www.movie.mr-div.ir' ||
    hostname.endsWith('.mr-div.ir')
  );
}

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

/**
 * Long-lived MKV→fMP4 remux stream. Always targets the Iran Node process
 * (or local sidecar in dev) — never a buffered Vercel serverless function.
 */
export function webMediaStreamUrl(targetUrl: string): string {
  const rel = `/api/media-stream?url=${encodeURIComponent(targetUrl)}`;
  if (Platform.OS !== 'web') return rel;
  if (typeof window === 'undefined') return rel;

  const { protocol, hostname } = window.location;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return `${protocol}//${hostname}:${WEB_DEV_PROXY_PORT}${rel}`;
  }
  if (isIranAppHost(hostname)) {
    return rel;
  }
  return `${IRAN_STREAM_ORIGIN}${rel}`;
}

/** HLS playlist for browsers that cannot play MKV. `audioIndex` selects a dubbed track. */
export function webMediaHlsUrl(targetUrl: string, audioIndex = 0): string {
  const audio =
    Number.isFinite(audioIndex) && audioIndex > 0 ? `&audio=${audioIndex}` : '';
  const rel = `/api/media-hls?url=${encodeURIComponent(targetUrl)}${audio}`;
  if (Platform.OS !== 'web') return rel;
  if (typeof window === 'undefined') return rel;

  const { protocol, hostname } = window.location;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return `${protocol}//${hostname}:${WEB_DEV_PROXY_PORT}${rel}`;
  }
  if (isIranAppHost(hostname)) {
    return rel;
  }
  return `${IRAN_STREAM_ORIGIN}${rel}`;
}

export function webMediaHlsMetaUrl(targetUrl: string): string {
  return `${webMediaHlsUrl(targetUrl)}&meta=1`;
}

/** `{ ffmpeg: true }` only when this host can actually run ffmpeg. */
export function webMediaStreamProbeUrl(): string {
  const sample = webMediaStreamUrl('https://dls6.aparatchi-dlcenter.top/probe.mkv');
  return sample.replace(/\?url=.*$/, '?probe=1');
}
