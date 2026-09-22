import type { VideoPlayer as ExpoVideoPlayer, SubtitleTrack } from 'expo-video';
import { Platform } from 'react-native';
import { webCatalogApiUrl } from '../catalog/webProxy';
import { pickPreferredSubtitle } from './subtitlePicker';
import {
  extractMkvTextSubtitles,
  setMkvRequestUrlRewriter,
  type ExtractedSubtitleTrack,
} from './mkvSubtitles';

if (Platform.OS === 'web') {
  setMkvRequestUrlRewriter((url) => webCatalogApiUrl('/api/media-range', url));
}

const trackCache = new Map<string, Promise<ExtractedSubtitleTrack[]>>();

const TRACK_ATTR = 'data-dmovie-sub';
const STYLE_ID = 'dmovie-web-cues';
const SIDECAR_EXT = ['.vtt', '.srt', '.ass'];

type WebPlayer = {
  _mountedVideos?: Set<HTMLVideoElement>;
};

function videoFromPlayer(player: ExpoVideoPlayer): HTMLVideoElement | null {
  const videos = (player as unknown as WebPlayer)._mountedVideos;
  if (!videos || videos.size === 0) return null;
  return [...videos][0] ?? null;
}

function waitForVideo(
  player: ExpoVideoPlayer,
  signal?: AbortSignal,
): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const video = videoFromPlayer(player);
      if (video) {
        resolve(video);
        return;
      }
      if (Date.now() - start > 15_000) {
        reject(new Error('video element missing'));
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function ensureCueStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
video::cue {
  color: #f5f7fb;
  background-color: rgba(0, 0, 0, 0.58);
  font-family: Tahoma, "Vazirmatn", "Segoe UI", sans-serif;
  font-size: 1.05em;
  line-height: 1.35;
  white-space: pre-line;
}
`;
  document.head.appendChild(style);
}

function srtToVtt(srt: string) {
  const normalized = srt.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  if (/^WEBVTT/i.test(normalized)) return normalized;
  const blocks = normalized.split(/\n\n+/);
  const lines = ['WEBVTT', ''];
  for (const block of blocks) {
    const rows = block.split('\n').filter(Boolean);
    if (!rows.length) continue;
    const timeIndex = rows.findIndex((row) => row.includes('-->'));
    if (timeIndex < 0) continue;
    const stamp = rows[timeIndex]
      .replace(/,/g, '.')
      .replace(/(\.\d{3})\d+/g, '$1');
    const text = rows
      .slice(timeIndex + 1)
      .join('\n')
      .replace(/<\/?[^>]+>/g, '')
      .trim();
    if (!text) continue;
    lines.push(stamp);
    lines.push(text);
    lines.push('');
  }
  return lines.join('\n');
}

function assToVtt(ass: string) {
  const lines = ['WEBVTT', ''];
  for (const raw of ass.replace(/\r\n/g, '\n').split('\n')) {
    if (!/^dialogue:/i.test(raw)) continue;
    const payload = raw.slice(raw.indexOf(':') + 1);
    const parts = payload.split(',');
    if (parts.length < 10) continue;
    const start = assTime(parts[1] ?? '');
    const end = assTime(parts[2] ?? '');
    const text = parts
      .slice(9)
      .join(',')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\[nNh]/gi, '\n')
      .trim();
    if (!text || start == null || end == null) continue;
    lines.push(`${start} --> ${end}`);
    lines.push(text);
    lines.push('');
  }
  return lines.join('\n');
}

function assTime(value: string) {
  const match = value.trim().match(/(\d+):(\d{2}):(\d{2})[.:](\d{1,3})/);
  if (!match) return null;
  const h = match[1]?.padStart(2, '0');
  const m = match[2];
  const s = match[3];
  const f = (match[4] ?? '0').padEnd(3, '0').slice(0, 3);
  return `${h}:${m}:${s}.${f}`;
}

async function fetchText(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { method: 'GET', signal });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.text();
}

function pathnameOf(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return url;
  }
}

function fileNameOf(url: string) {
  const path = pathnameOf(url);
  return path.split('/').filter(Boolean).pop() || path;
}

function isCatalogHost(url: string) {
  try {
    return /^dls\d*\.aparatchi-dlcenter\.top$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function findRedirectedResource(original: string) {
  if (typeof performance === 'undefined') return null;
  const originalPath = pathnameOf(original);
  const originalName = fileNameOf(original);
  for (const entry of performance.getEntriesByType('resource')) {
    if (entry.name === original || isCatalogHost(entry.name)) continue;
    const path = pathnameOf(entry.name);
    if (path.endsWith(originalPath) || originalPath.endsWith(path)) {
      return entry.name;
    }
    if (
      originalName &&
      fileNameOf(entry.name) === originalName &&
      /\.(mkv|mp4|m4v|avi|webm)(?:$|\?)/i.test(entry.name)
    ) {
      return entry.name;
    }
  }
  return null;
}

function waitForFetchableUrl(original: string, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const existing = findRedirectedResource(original);
    if (existing) {
      resolve(existing);
      return;
    }
    const started = Date.now();
    const finish = (url: string) => {
      cleanup();
      resolve(url);
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('Aborted'));
    };
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer =
      typeof PerformanceObserver === 'function'
        ? new PerformanceObserver(() => {
            const hit = findRedirectedResource(original);
            if (hit) finish(hit);
          })
        : null;
    const poll = () => {
      if (signal?.aborted) {
        onAbort();
        return;
      }
      const hit = findRedirectedResource(original);
      if (hit) {
        finish(hit);
        return;
      }
      if (Date.now() - started > 20_000) {
        cleanup();
        reject(new Error('NO_FETCHABLE_URL'));
        return;
      }
      timer = setTimeout(poll, 150);
    };
    const cleanup = () => {
      observer?.disconnect();
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort);
    try {
      observer?.observe({ type: 'resource', buffered: true });
    } catch {
      observer?.observe({ entryTypes: ['resource'] });
    }
    poll();
  });
}

async function resolveViaProxy(original: string, signal?: AbortSignal) {
  const response = await fetch(webCatalogApiUrl('/api/media-resolve', original), {
    method: 'GET',
    signal,
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const data = (await response.json()) as { url?: string };
  if (
    typeof data?.url === 'string' &&
    data.url.startsWith('https://') &&
    !isCatalogHost(data.url)
  ) {
    return data.url;
  }
  throw new Error('BAD_RESOLVE');
}

async function resolveFetchableMediaUrl(original: string, signal?: AbortSignal) {
  const already = findRedirectedResource(original);
  if (already) return already;

  const fromTiming = waitForFetchableUrl(original, signal);
  const fromProxy = resolveViaProxy(original, signal).catch(() => null);

  const raced = await Promise.race([
    fromTiming,
    fromProxy.then((url) => {
      if (url) return url;
      return fromTiming;
    }),
  ]);
  if (raced && !isCatalogHost(raced)) return raced;

  try {
    const probe = await fetch(original, {
      method: 'GET',
      headers: { Range: 'bytes=0-15' },
      signal,
    });
    if ((probe.ok || probe.status === 206) && !isCatalogHost(original)) {
      return original;
    }
  } catch {
    // Catalog hosts redirect without CORS; the storage URL is CORS-enabled.
  }
  return fromTiming;
}

function sidecarUrls(videoUrl: string) {
  try {
    const url = new URL(videoUrl);
    const match = url.pathname.match(/\.(mkv|mp4|m4v|avi|webm)$/i);
    if (!match) return [];
    return SIDECAR_EXT.map((ext) => {
      const next = new URL(url.toString());
      next.pathname = url.pathname.replace(/\.(mkv|mp4|m4v|avi|webm)$/i, ext);
      return next.toString();
    });
  } catch {
    return [];
  }
}

function guessSidecarMeta(url: string): ExtractedSubtitleTrack | null {
  const lower = url.toLowerCase();
  const isVtt = lower.endsWith('.vtt');
  const isAss = lower.endsWith('.ass') || lower.endsWith('.ssa');
  return {
    id: 'sidecar',
    language: 'fa',
    label: 'فارسی',
    name: 'فارسی',
    vtt: isVtt ? 'vtt' : isAss ? 'ass' : 'srt',
  };
}

async function loadSidecarTracks(
  videoUrl: string,
  signal?: AbortSignal,
): Promise<ExtractedSubtitleTrack[]> {
  for (const url of sidecarUrls(videoUrl)) {
    try {
      const body = await fetchText(url, signal);
      if (!body || body.length < 16) continue;
      if (/<html/i.test(body.slice(0, 80))) continue;
      const kind = guessSidecarMeta(url);
      if (!kind) continue;
      const vtt =
        kind.vtt === 'vtt'
          ? srtToVtt(body)
          : kind.vtt === 'ass'
            ? assToVtt(body)
            : srtToVtt(body);
      if (!vtt.includes('-->')) continue;
      return [{ ...kind, vtt }];
    } catch {
      // Try the next extension.
    }
  }
  return [];
}

function revokeBlobSrc(el: HTMLTrackElement) {
  const src = el.getAttribute('src');
  if (src && src.startsWith('blob:')) URL.revokeObjectURL(src);
}

function clearTracks(video: HTMLVideoElement) {
  video.querySelectorAll(`track[${TRACK_ATTR}]`).forEach((node) => {
    revokeBlobSrc(node as HTMLTrackElement);
    node.remove();
  });
}

function blobUrlFor(vtt: string) {
  const blob = new Blob([vtt], { type: 'text/vtt' });
  return URL.createObjectURL(blob);
}

function asPickerTracks(tracks: ExtractedSubtitleTrack[]): SubtitleTrack[] {
  return tracks.map((track) => ({
    id: track.id,
    language: track.language,
    label: track.label,
    name: track.name,
  }));
}

function applyTrackModes(
  video: HTMLVideoElement,
  preferredId: string | null,
) {
  const preferred = [...video.querySelectorAll(`track[${TRACK_ATTR}]`)].find(
    (node) => node.getAttribute(TRACK_ATTR) === preferredId,
  ) as HTMLTrackElement | undefined;
  for (let i = 0; i < video.textTracks.length; i++) {
    const track = video.textTracks[i];
    if (!track) continue;
    const show =
      preferred?.track === track ||
      (!preferred && i === 0);
    track.mode = show ? 'showing' : 'disabled';
  }
}

function attachTracks(video: HTMLVideoElement, tracks: ExtractedSubtitleTrack[]) {
  ensureCueStyle();
  clearTracks(video);
  const preferred = pickPreferredSubtitle(asPickerTracks(tracks));
  const preferredId = preferred?.id ?? tracks[0]?.id ?? null;
  for (const track of tracks) {
    const el = document.createElement('track');
    el.setAttribute(TRACK_ATTR, track.id);
    el.kind = 'subtitles';
    el.srclang = track.language || 'fa';
    el.label = track.label;
    el.src = blobUrlFor(track.vtt);
    if (track.id === preferredId) el.default = true;
    video.appendChild(el);
  }
  const reveal = () => applyTrackModes(video, preferredId);
  video.querySelectorAll(`track[${TRACK_ATTR}]`).forEach((node) => {
    node.addEventListener('load', reveal);
    node.addEventListener('cuechange', reveal);
  });
  reveal();
  requestAnimationFrame(reveal);
}

function isMkvUrl(url: string) {
  return /\.mkv(?:$|\?)/i.test(url);
}

function tracksFor(videoUrl: string, signal?: AbortSignal): Promise<ExtractedSubtitleTrack[]> {
  const cached = trackCache.get(videoUrl);
  if (cached) return cached;
  const pending = (async () => {
    // Catalog hosts have no CORS; Range reads go through /api/media-range.
    if (isMkvUrl(videoUrl)) {
      const extracted = await extractMkvTextSubtitles(videoUrl, signal);
      if (extracted.length) return extracted;
    }
    const fetchUrl = await resolveFetchableMediaUrl(videoUrl, signal).catch(
      () => videoUrl,
    );
    if (fetchUrl !== videoUrl && isMkvUrl(fetchUrl)) {
      const extracted = await extractMkvTextSubtitles(fetchUrl, signal);
      if (extracted.length) return extracted;
    }
    const sidecar = await loadSidecarTracks(fetchUrl);
    if (sidecar.length) return sidecar;
    if (!isMkvUrl(fetchUrl) && !isMkvUrl(videoUrl)) {
      return extractMkvTextSubtitles(fetchUrl, signal);
    }
    return [];
  })().catch((err) => {
    trackCache.delete(videoUrl);
    throw err;
  });
  trackCache.set(videoUrl, pending);
  return pending;
}

export async function loadWebVideoSubtitles(
  player: ExpoVideoPlayer,
  videoUrl: string,
  signal?: AbortSignal,
) {
  if (typeof document === 'undefined') return;
  const video = await waitForVideo(player, signal);
  const tracks = await tracksFor(videoUrl, signal);
  if (!tracks.length || signal?.aborted) return;
  attachTracks(video, tracks);
}

export function disposeWebVideoSubtitles(player: ExpoVideoPlayer) {
  if (typeof document === 'undefined') return;
  const video = videoFromPlayer(player);
  if (video) clearTracks(video);
}
