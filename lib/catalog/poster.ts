import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { clearPosters, getMeta, getPoster, setMeta, upsertPoster } from './db';
import { isSeriesItem, type CatalogItem } from './types';
import { WEB_DEV_PROXY_PORT } from './webProxy';

export const POSTER_USER_AGENT =
  'Mozilla/5.0 (compatible; MrDivMovie/1.0; IMDb poster lookup)';

const MISS_TTL_MS = 1000 * 60 * 60 * 24;
const POSTER_GEN = '7';
const FETCH_CONCURRENCY = 6;
const IMDB_ID_RE = /^tt\d{5,}$/;

export type PosterQuery = {
  imdbId: string;
  title: string;
  titleFa?: string;
  year?: number;
  isSeries?: boolean;
};

const memory = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();
let appliedGen: string | null = null;
let fetchActive = 0;
const fetchWaiters: Array<() => void> = [];

function normalizeImdbId(raw: string): string {
  return raw.trim().toLowerCase();
}

function fileId(imdbId: string): string {
  return imdbId.replace(/[^a-z0-9]/gi, '');
}

function localPosterFile(imdbId: string): File {
  return new File(Paths.cache, 'posters', `${fileId(imdbId)}.jpg`);
}

function ensurePosterDir() {
  const dir = new Directory(Paths.cache, 'posters');
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
}

function compactPosterUrl(url: string): string {
  if (!/^https:\/\/m\.media-amazon\.com\//i.test(url)) return url;
  return url.replace(/\._V1_[^./]*\.(jpe?g|png|webp)$/i, '._V1_UX342.$1');
}

/** Web: same-origin (or local sidecar) image proxy — browser never hits IMDb JSON. */
function webPosterImageUrl(imdbId: string): string {
  const rel = `/api/poster-image?id=${encodeURIComponent(imdbId)}`;
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

function suggestionUrl(imdbId: string): string {
  const first = imdbId[0] || 't';
  return `https://v2.sg.media-imdb.com/suggestion/${first}/${imdbId}.json`;
}

async function acquireFetchSlot() {
  if (fetchActive >= FETCH_CONCURRENCY) {
    await new Promise<void>((resolve) => {
      fetchWaiters.push(resolve);
    });
  }
  fetchActive += 1;
}

function releaseFetchSlot() {
  fetchActive = Math.max(0, fetchActive - 1);
  fetchWaiters.shift()?.();
}

async function lookupImdbPosterUrl(imdbId: string): Promise<string | null> {
  await acquireFetchSlot();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(suggestionUrl(imdbId), {
      headers: {
        Accept: 'application/json',
        'User-Agent': POSTER_USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const data = (await response.json()) as {
      d?: Array<{ id?: string; i?: { imageUrl?: string } }>;
    };
    const rows = Array.isArray(data.d) ? data.d : [];
    const hit =
      rows.find((row) => normalizeImdbId(row.id || '') === imdbId) || rows[0];
    const imageUrl = hit?.i?.imageUrl;
    if (typeof imageUrl !== 'string' || !imageUrl.startsWith('https://')) {
      return null;
    }
    return compactPosterUrl(imageUrl);
  } finally {
    clearTimeout(timer);
    releaseFetchSlot();
  }
}

async function lookupRemotePoster(query: PosterQuery): Promise<string | null> {
  const imdbId = normalizeImdbId(query.imdbId);
  if (!IMDB_ID_RE.test(imdbId)) return null;

  // Web loads through our proxy so CORS / Iran Amazon blocks do not blank the grid.
  if (Platform.OS === 'web') {
    return webPosterImageUrl(imdbId);
  }

  return lookupImdbPosterUrl(imdbId);
}

async function cachePosterFile(
  imdbId: string,
  remoteUrl: string,
): Promise<string | null> {
  if (Platform.OS === 'web') return remoteUrl;
  try {
    ensurePosterDir();
    const dest = localPosterFile(imdbId);
    const file = await File.downloadFileAsync(remoteUrl, dest, {
      idempotent: true,
      headers: {
        Accept: 'image/*',
        'User-Agent': POSTER_USER_AGENT,
        Referer: 'https://www.imdb.com/',
      },
    });
    return file.exists ? file.uri : dest.exists ? dest.uri : null;
  } catch {
    return null;
  }
}

function usableFileUri(uri: string | null | undefined): string | null {
  if (!uri || Platform.OS === 'web') return null;
  try {
    return new File(uri).exists ? uri : null;
  } catch {
    return null;
  }
}

function bumpPosterGen() {
  if (appliedGen === POSTER_GEN) return;
  memory.clear();
  inflight.clear();
  appliedGen = POSTER_GEN;
}

export async function getPosterUrl(query: PosterQuery): Promise<string | null> {
  const imdbId = normalizeImdbId(query.imdbId);
  if (!IMDB_ID_RE.test(imdbId)) return null;
  bumpPosterGen();
  if (memory.has(imdbId)) return memory.get(imdbId) ?? null;

  const pending = inflight.get(imdbId);
  if (pending) return pending;

  const request = (async () => {
    try {
      if (Platform.OS !== 'web') {
        const gen = await getMeta('poster_gen');
        if (gen !== POSTER_GEN) {
          await clearPosters();
          await setMeta('poster_gen', POSTER_GEN);
        }
      }
      const stored = await getPoster(imdbId);
      const local = usableFileUri(stored?.fileUri);
      if (local) {
        memory.set(imdbId, local);
        return local;
      }
      if (stored?.remoteUrl) {
        // Skip stale Wikipedia / other hosts after switching to IMDb.
        const isImdbHost =
          /media-amazon\.com/i.test(stored.remoteUrl) ||
          /\/api\/poster-image\?/i.test(stored.remoteUrl);
        if (isImdbHost) {
          const fileUri = await cachePosterFile(imdbId, stored.remoteUrl);
          const next = fileUri ?? stored.remoteUrl;
          memory.set(imdbId, next);
          if (fileUri) {
            await upsertPoster(imdbId, stored.remoteUrl, fileUri);
          }
          return next;
        }
      }
      if (
        stored &&
        !stored.remoteUrl &&
        Date.now() - stored.updatedAt < MISS_TTL_MS
      ) {
        memory.set(imdbId, null);
        return null;
      }

      const remote = await lookupRemotePoster({ ...query, imdbId });
      if (!remote) {
        memory.set(imdbId, null);
        await upsertPoster(imdbId, null, null);
        return null;
      }
      const fileUri = await cachePosterFile(imdbId, remote);
      const next = fileUri ?? remote;
      memory.set(imdbId, next);
      await upsertPoster(imdbId, remote, fileUri);
      return next;
    } catch {
      return null;
    } finally {
      inflight.delete(imdbId);
    }
  })();

  inflight.set(imdbId, request);
  return request;
}

export function usePosterUrl(item: CatalogItem): string | null {
  const [url, setUrl] = useState<string | null>(
    () => memory.get(normalizeImdbId(item.imdbId)) ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const query = {
      imdbId: item.imdbId,
      title: item.title,
      titleFa: item.titleFa,
      year: item.year,
      isSeries: isSeriesItem(item),
    };
    const run = () => {
      void getPosterUrl(query).then((next) => {
        if (cancelled) return;
        setUrl(next);
        if (!next && attempt < 3) {
          attempt += 1;
          retryTimer = setTimeout(run, 800 * attempt);
        }
      });
    };
    run();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [item.imdbId, item.title, item.titleFa, item.year, item.type]);

  return url;
}
