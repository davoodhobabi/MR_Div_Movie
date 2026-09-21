import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { getPoster, upsertPoster } from './db';
import { isSeriesItem, type CatalogItem } from './types';

export const POSTER_USER_AGENT =
  'MrDivMovie/1.0.12 (personal Android catalog; Wikipedia poster lookup)';

const MISS_TTL_MS = 1000 * 60 * 60 * 24;

export type PosterQuery = {
  imdbId: string;
  title: string;
  titleFa?: string;
  year?: number;
  isSeries?: boolean;
};

const memory = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

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

function cleanThumb(url: string): string {
  return url.replace(/\?.*$/, '');
}

function firstThumb(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const pages = (data as { query?: { pages?: Record<string, unknown> } }).query
    ?.pages;
  if (pages) {
    const rows = Object.values(pages) as Array<{
      index?: number;
      thumbnail?: { source?: string };
    }>;
    rows.sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
    for (const row of rows) {
      const src = row.thumbnail?.source;
      if (typeof src === 'string' && src.startsWith('https://')) {
        return cleanThumb(src);
      }
    }
  }
  const src = (data as { thumbnail?: { source?: string } }).thumbnail?.source;
  if (typeof src === 'string' && src.startsWith('https://')) {
    return cleanThumb(src);
  }
  return null;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': POSTER_USER_AGENT,
        'Api-User-Agent': POSTER_USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function wikiSearchUrl(host: string, query: string): string {
  return (
    `https://${host}/w/api.php?` +
    new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      generator: 'search',
      gsrsearch: query,
      gsrlimit: '5',
      gsrnamespace: '0',
      prop: 'pageimages',
      piprop: 'thumbnail',
      pithumbsize: '420',
    }).toString()
  );
}

function wikiSummaryUrl(host: string, title: string): string {
  const path = encodeURIComponent(title.trim().replace(/\s+/g, '_'));
  return `https://${host}/api/rest_v1/page/summary/${path}`;
}

async function lookupWikidataSitelink(imdbId: string): Promise<string | null> {
  const search = (await fetchJson(
    'https://www.wikidata.org/w/api.php?' +
      new URLSearchParams({
        action: 'query',
        format: 'json',
        origin: '*',
        list: 'search',
        srlimit: '1',
        srsearch: `haswbstatement:P345=${imdbId}`,
      }).toString(),
  )) as { query?: { search?: { title?: string }[] } } | null;
  const qid = search?.query?.search?.[0]?.title?.trim();
  if (!qid || !/^Q\d+$/i.test(qid)) return null;

  const payload = (await fetchJson(
    'https://www.wikidata.org/w/api.php?' +
      new URLSearchParams({
        action: 'wbgetentities',
        format: 'json',
        origin: '*',
        ids: qid,
        props: 'sitelinks',
        sitefilter: 'enwiki|fawiki',
      }).toString(),
  )) as {
    entities?: Record<
      string,
      { sitelinks?: Record<string, { title?: string }> }
    >;
  } | null;
  const links = payload?.entities?.[qid]?.sitelinks;
  const titles = [
    { host: 'en.wikipedia.org', title: links?.enwiki?.title },
    { host: 'fa.wikipedia.org', title: links?.fawiki?.title },
  ];
  for (const item of titles) {
    if (!item.title) continue;
    const thumb = firstThumb(await fetchJson(wikiSummaryUrl(item.host, item.title)));
    if (thumb) return thumb;
  }
  return null;
}

async function lookupRemotePoster(query: PosterQuery): Promise<string | null> {
  const kindFa = query.isSeries ? 'مجموعه تلویزیونی' : 'فیلم';
  const kindEn = query.isSeries ? 'TV series' : 'film';
  const titleFa = query.titleFa?.trim() ?? '';
  const title = query.title.trim();
  const year = query.year;

  try {
    const fromWikidata = await lookupWikidataSitelink(query.imdbId);
    if (fromWikidata) return fromWikidata;
  } catch {
    // Fall through to Wikipedia title search.
  }

  const attempts: Array<{ host: string; q: string; rest?: boolean }> = [];
  if (title) {
    attempts.push({
      host: 'en.wikipedia.org',
      q: `${title} (${kindEn})`,
      rest: true,
    });
    if (query.isSeries) {
      attempts.push({
        host: 'en.wikipedia.org',
        q: `${title} (anime)`,
        rest: true,
      });
    }
    attempts.push({
      host: 'en.wikipedia.org',
      q: `${title} ${kindEn}${year ? ` ${year}` : ''}`,
    });
  }
  if (titleFa) {
    attempts.push({ host: 'fa.wikipedia.org', q: `${titleFa} ${kindFa}` });
    attempts.push({ host: 'fa.wikipedia.org', q: titleFa, rest: true });
  }

  const seen = new Set<string>();
  for (const attempt of attempts) {
    const key = `${attempt.host}|${attempt.q}|${attempt.rest ? 'r' : 's'}`;
    if (!attempt.q.trim() || seen.has(key)) continue;
    seen.add(key);
    try {
      const url = attempt.rest
        ? wikiSummaryUrl(attempt.host, attempt.q)
        : wikiSearchUrl(attempt.host, attempt.q);
      const thumb = firstThumb(await fetchJson(url));
      if (thumb) return thumb;
    } catch {
      // Keep trying other titles/hosts.
    }
  }
  return null;
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

export async function getPosterUrl(query: PosterQuery): Promise<string | null> {
  const imdbId = normalizeImdbId(query.imdbId);
  if (!/^tt\d{5,}$/.test(imdbId)) return null;
  if (memory.has(imdbId)) return memory.get(imdbId) ?? null;

  const pending = inflight.get(imdbId);
  if (pending) return pending;

  const request = (async () => {
    try {
      const stored = await getPoster(imdbId);
      const local = usableFileUri(stored?.fileUri);
      if (local) {
        memory.set(imdbId, local);
        return local;
      }
      if (stored?.remoteUrl) {
        const fileUri = await cachePosterFile(imdbId, stored.remoteUrl);
        const next = fileUri ?? stored.remoteUrl;
        memory.set(imdbId, next);
        if (fileUri) {
          await upsertPoster(imdbId, stored.remoteUrl, fileUri);
        }
        return next;
      }
      if (stored && !stored.remoteUrl && Date.now() - stored.updatedAt < MISS_TTL_MS) {
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
      memory.set(imdbId, null);
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
    void getPosterUrl({
      imdbId: item.imdbId,
      title: item.title,
      titleFa: item.titleFa,
      year: item.year,
      isSeries: isSeriesItem(item),
    }).then((next) => {
      if (!cancelled) setUrl(next);
    });
    return () => {
      cancelled = true;
    };
  }, [item.imdbId, item.title, item.titleFa, item.year, item.type]);

  return url;
}
