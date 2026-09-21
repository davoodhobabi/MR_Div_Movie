import type { CatalogEdition, CatalogItem, CatalogSource } from './types';

const ENTRY_RE =
  /<h3>(\d+)\.\s*([\s\S]*?)<\/h3>\s*<p><b>IMDb Code:<\/b>\s*([^<]+)<\/p>\s*<p><b>Title Type:<\/b>\s*([^<]+)<\/p>\s*<p><b>IMDb Votes:<\/b>\s*([^<]+)<\/p>\s*<p><b>IMDb Rates:<\/b>\s*([^<]+)<\/p>([\s\S]*?)(?=<h3>|$)/gi;

const P_RE = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
const EDITION_RE = /<b>\s*(SoftSub|Dubbed|NoSub)\s*<\/b>/i;
const SEASON_RE = /^\s*season\s+(\d+)\s*$/i;
const ANCHOR_RE =
  /<a\b([^>]*)>([^<]+)<\/a>\s*(?:\/\s*([^<]*?))?(?=<a|<\/p>|$)/gi;
const HREF_RE = /\s+href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i;

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

function cleanTitle(raw: string): string {
  return decodeHtml(raw)
    .replace(/\s+/g, ' ')
    .replace(/\s+start_year$/i, '')
    .trim();
}

function parseVotes(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function parseRating(raw: string): number | null {
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}

function cleanSize(raw: string | undefined): string {
  if (!raw) return '';
  return decodeHtml(raw).replace(/\s+/g, ' ').replace(/^[ /]+|[ /]+$/g, '');
}

function extractHref(attrs: string): string {
  const match = attrs.match(HREF_RE);
  if (!match) return '';
  let raw = match[1].trim();
  if (
    raw.length >= 2 &&
    (raw[0] === '"' || raw[0] === "'") &&
    raw[0] === raw[raw.length - 1]
  ) {
    raw = raw.slice(1, -1);
  }
  return decodeHtml(raw);
}

function parseSources(body: string): CatalogSource[] {
  const sources: CatalogSource[] = [];
  let edition: CatalogEdition | null = null;
  let season: string | null = null;

  for (const paragraphMatch of body.matchAll(P_RE)) {
    const paragraph = paragraphMatch[1];
    const editionMatch = paragraph.match(EDITION_RE);
    if (editionMatch) {
      const label = editionMatch[1].toLowerCase();
      edition =
        label === 'softsub'
          ? 'SoftSub'
          : label === 'dubbed'
            ? 'Dubbed'
            : label === 'nosub'
              ? 'NoSub'
              : null;
      season = null;
      continue;
    }

    const textOnly = paragraph.replace(/<[^>]+>/g, '').trim();
    const seasonMatch = textOnly.match(SEASON_RE);
    if (seasonMatch) {
      season = `Season ${Number(seasonMatch[1])}`;
      continue;
    }

    if (!edition) continue;

    for (const anchor of paragraph.matchAll(ANCHOR_RE)) {
      const quality = decodeHtml(anchor[2]);
      if (!quality) continue;
      sources.push({
        title: season ? `${season} · ${quality}` : quality,
        url: extractHref(anchor[1]),
        size: cleanSize(anchor[3]),
        edition,
      });
    }
  }

  return sources;
}

export function parseCatalogHtml(html: string): CatalogItem[] {
  const items: CatalogItem[] = [];

  for (const match of html.matchAll(ENTRY_RE)) {
    items.push({
      index: Number(match[1]),
      title: cleanTitle(match[2]),
      imdbId: decodeHtml(match[3]),
      type: decodeHtml(match[4]).toLowerCase(),
      imdbVotes: parseVotes(match[5]),
      imdbRating: parseRating(match[6]),
      urls: parseSources(match[7]),
    });
  }

  return items;
}

/** Yields to the event loop so large archives don't freeze the UI spinner. */
export async function parseCatalogHtmlAsync(
  html: string,
  onProgress?: (done: number, totalHint: number) => void,
): Promise<CatalogItem[]> {
  const items: CatalogItem[] = [];
  const totalHint = Math.max(1, (html.match(/<h3>\s*\d+\./gi) || []).length);
  let done = 0;

  for (const match of html.matchAll(ENTRY_RE)) {
    items.push({
      index: Number(match[1]),
      title: cleanTitle(match[2]),
      imdbId: decodeHtml(match[3]),
      type: decodeHtml(match[4]).toLowerCase(),
      imdbVotes: parseVotes(match[5]),
      imdbRating: parseRating(match[6]),
      urls: parseSources(match[7]),
    });
    done += 1;
    if (done % 150 === 0) {
      onProgress?.(done, totalHint);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  onProgress?.(done, totalHint);
  return items;
}
