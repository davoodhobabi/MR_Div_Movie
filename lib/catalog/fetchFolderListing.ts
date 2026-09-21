import { Platform } from 'react-native';
import type { FolderEpisode } from './types';

const FOLDER_LISTING_PROXY = '/api/folder-listing';
const FOLDER_LISTING_DEV_PROXY_PORT = 8787;

const FETCH_TIMEOUT_MS = 120_000;
const MAX_SUBFOLDERS = 16;
const VIDEO_EXT_RE = /\.(mkv|mp4|m4v|avi|webm)$/i;
/** Prefer href-only matching — inner HTML with icons/code is irrelevant and expensive on huge listings (e.g. Bleach 366 eps). */
const VIDEO_HREF_RE =
  /href\s*=\s*(?:"([^"]+\.(?:mkv|mp4|m4v|avi|webm))"|'([^']+\.(?:mkv|mp4|m4v|avi|webm))'|([^\s>]+\.(?:mkv|mp4|m4v|avi|webm)))/gi;
const DIR_HREF_RE =
  /href\s*=\s*(?:"([^"]+\/)"|'([^']+\/)'|([^\s>]+\/))/gi;

function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function mapFetchError(err: unknown): Error {
  if (err instanceof Error) {
    if (
      err.name === 'AbortError' ||
      /aborted|AbortError|timeout/i.test(err.message)
    ) {
      return new Error('TIMEOUT');
    }
    if (
      err.message === 'TIMEOUT' ||
      err.message === 'IRAN_IP_REQUIRED' ||
      err.message === 'EMPTY_LIST' ||
      err.message === 'EMPTY_HTML' ||
      err.message.startsWith('HTTP_')
    ) {
      return err;
    }
  }
  return err instanceof Error ? err : new Error('UNKNOWN');
}

type ParsedIndex = {
  episodes: FolderEpisode[];
  subfolders: string[];
};

function collectMatches(re: RegExp, html: string): string[] {
  const out: string[] = [];
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = decodeHtml(match[1] || match[2] || match[3] || '');
    if (raw) out.push(raw);
  }
  return out;
}

function parseAutoIndexHtml(html: string, folderUrl: string): ParsedIndex {
  const base = withTrailingSlash(folderUrl);
  const episodes: FolderEpisode[] = [];
  const subfolders: string[] = [];
  const seenFiles = new Set<string>();
  const seenFolders = new Set<string>();

  for (const hrefRaw of collectMatches(VIDEO_HREF_RE, html)) {
    let absolute: string;
    try {
      absolute = new URL(hrefRaw, base).toString();
    } catch {
      continue;
    }

    const pathname = (() => {
      try {
        return decodeURIComponent(new URL(absolute).pathname);
      } catch {
        return absolute;
      }
    })();

    if (!VIDEO_EXT_RE.test(pathname)) continue;
    const name = pathname.split('/').pop() || hrefRaw;
    if (!name || seenFiles.has(absolute)) continue;
    seenFiles.add(absolute);
    episodes.push({ name, url: absolute });
  }

  if (episodes.length === 0) {
    for (const hrefRaw of collectMatches(DIR_HREF_RE, html)) {
      if (!hrefRaw || hrefRaw === '../' || hrefRaw === './') continue;
      let absolute: string;
      try {
        absolute = new URL(hrefRaw, base).toString();
      } catch {
        continue;
      }
      const dirUrl = withTrailingSlash(absolute);
      if (dirUrl === base || seenFolders.has(dirUrl)) continue;
      if (!dirUrl.startsWith(base)) continue;
      seenFolders.add(dirUrl);
      subfolders.push(dirUrl);
    }
  }

  episodes.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  );
  subfolders.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return { episodes, subfolders };
}

function listingRequestUrl(url: string): string {
  if (Platform.OS !== 'web') return url;
  const path = `${FOLDER_LISTING_PROXY}?url=${encodeURIComponent(url)}`;
  if (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    typeof window !== 'undefined'
  ) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${FOLDER_LISTING_DEV_PROXY_PORT}${path}`;
  }
  return path;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const headers: Record<string, string> = {
    Accept: 'text/html,application/xhtml+xml,*/*',
  };
  if (Platform.OS !== 'web') {
    headers['User-Agent'] =
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  }

  try {
    const response = await fetch(listingRequestUrl(url), {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    const html = await response.text();
    if (!response.ok) {
      if (html === 'TIMEOUT' || html === 'IRAN_IP_REQUIRED' || html === 'EMPTY_URL') {
        throw new Error(html);
      }
      if (response.status === 503) throw new Error('IRAN_IP_REQUIRED');
      if (response.status === 504) throw new Error('TIMEOUT');
      throw new Error(`HTTP_${response.status}`);
    }

    if (!html || html.length < 20) throw new Error('EMPTY_HTML');

    if (
      /آی\s*پی\s*داخلی|Service Unavailable|vpn|پروکسی/i.test(html) &&
      !VIDEO_EXT_RE.test(html)
    ) {
      throw new Error('IRAN_IP_REQUIRED');
    }

    return html;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchFolderListing(
  folderUrl: string,
): Promise<FolderEpisode[]> {
  const url = withTrailingSlash(folderUrl.trim());
  if (!url) throw new Error('EMPTY_URL');

  try {
    const html = await fetchHtml(url);
    const { episodes, subfolders } = parseAutoIndexHtml(html, url);

    if (episodes.length > 0) return episodes;

    const targets = subfolders.slice(0, MAX_SUBFOLDERS);
    if (targets.length === 0) throw new Error('EMPTY_LIST');

    const nested: FolderEpisode[] = [];
    const seen = new Set<string>();

    await Promise.all(
      targets.map(async (sub) => {
        try {
          const childHtml = await fetchHtml(sub);
          const child = parseAutoIndexHtml(childHtml, sub);
          for (const episode of child.episodes) {
            if (seen.has(episode.url)) continue;
            seen.add(episode.url);
            nested.push(episode);
          }
        } catch {
          // Ignore individual subfolder failures; others may still succeed.
        }
      }),
    );

    nested.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    );

    if (nested.length === 0) throw new Error('EMPTY_LIST');
    return nested;
  } catch (err: unknown) {
    throw mapFetchError(err);
  }
}
