import { paintTick, waitUntilIdle } from './idleWork';
import type {
  CatalogEdition,
  CatalogItem,
  CatalogSource,
  SeriesQualityOption,
  SeriesSeason,
} from './types';
import { CATALOG_EDITIONS } from './types';

type RawSource = {
  version?: string;
  quality?: string;
  file?: string;
  folder?: string;
  size?: string;
  season?: number;
  avg_episode_size?: number;
  number_of_episodes?: number;
};

function isEdition(value: string): value is CatalogEdition {
  return (CATALOG_EDITIONS as readonly string[]).includes(value);
}

function formatQuality(raw: string): string {
  return raw.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

function formatAvgSize(bytes: number | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `هر اپیزود حدودا ${gb.toLocaleString('fa-IR', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    })} گیگابایت`;
  }
  const mb = bytes / (1024 * 1024);
  return `هر اپیزود حدودا ${Math.round(mb).toLocaleString('fa-IR')} مگابایت`;
}

function formatMovieSize(raw: string | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^~?\s*([\d.]+)\s*(TB|GB|MB|KB)\b/i);
  if (!match) return trimmed;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return trimmed;
  const unit = match[2].toUpperCase();
  const unitFa =
    unit === 'TB'
      ? 'ترابایت'
      : unit === 'GB'
        ? 'گیگابایت'
        : unit === 'MB'
          ? 'مگابایت'
          : 'کیلوبایت';
  const fraction = match[1].includes('.')
    ? Math.min((match[1].split('.')[1] ?? '').length, 2)
    : unit === 'GB' || unit === 'TB'
      ? 2
      : 0;
  return `${value.toLocaleString('fa-IR', {
    maximumFractionDigits: fraction,
    minimumFractionDigits: fraction,
  })} ${unitFa}`;
}

function resolveUrl(raw: string, baseUrl: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return trimmed;
  }
}

function extractDataAssignment(source: string): string {
  const marker = source.match(/let\s+data\s*=\s*/);
  if (!marker || marker.index == null) {
    throw new Error('PARSE_EMPTY');
  }

  const start = source.indexOf('[', marker.index + marker[0].length);
  if (start < 0) {
    throw new Error('PARSE_EMPTY');
  }

  let depth = 0;
  let end = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end < 0) {
    throw new Error('PARSE_EMPTY');
  }

  return `let data = ${source.slice(start, end + 1)}`;
}

function assertValidArchiveJs(source: string): void {
  if (!source || source.length < 100) {
    throw new Error('EMPTY_HTML');
  }

  const looksBlocked =
    /آی\s*پی\s*داخلی|Service Unavailable|vpn|پروکسی/i.test(source) &&
    !/let\s+data\s*=/.test(source);

  if (looksBlocked) {
    throw new Error('IRAN_IP_REQUIRED');
  }
}

function mapMovieSources(
  sourcesMap: Record<string, unknown>,
  baseUrl: string,
): CatalogSource[] {
  const out: CatalogSource[] = [];

  for (const group of Object.values(sourcesMap)) {
    if (!Array.isArray(group)) continue;
    for (const entry of group as RawSource[]) {
      const version = String(entry.version ?? '');
      if (!isEdition(version)) continue;
      const file = typeof entry.file === 'string' ? entry.file : '';
      const quality = typeof entry.quality === 'string' ? entry.quality : '';
      if (!file || !quality) continue;
      out.push({
        title: formatQuality(quality),
        url: resolveUrl(file, baseUrl),
        size: formatMovieSize(
          typeof entry.size === 'string' ? entry.size : undefined,
        ),
        edition: version,
      });
    }
  }

  return out;
}

function mapSeriesSeasons(
  sourcesMap: Record<string, unknown>,
  baseUrl: string,
): SeriesSeason[] {
  const bySeason = new Map<number, SeriesQualityOption[]>();

  for (const seasonMap of Object.values(sourcesMap)) {
    if (!seasonMap || typeof seasonMap !== 'object' || Array.isArray(seasonMap)) {
      continue;
    }

    for (const group of Object.values(seasonMap as Record<string, unknown>)) {
      if (!Array.isArray(group)) continue;
      for (const entry of group as RawSource[]) {
        const version = String(entry.version ?? '');
        if (!isEdition(version)) continue;
        const folder = typeof entry.folder === 'string' ? entry.folder : '';
        const quality = typeof entry.quality === 'string' ? entry.quality : '';
        if (!folder || !quality) continue;
        const season =
          typeof entry.season === 'number' && Number.isFinite(entry.season)
            ? entry.season
            : null;
        if (season == null) continue;

        const option: SeriesQualityOption = {
          edition: version,
          quality: formatQuality(quality),
          folderUrl: resolveUrl(folder, baseUrl),
          episodeCount:
            typeof entry.number_of_episodes === 'number' &&
            Number.isFinite(entry.number_of_episodes)
              ? entry.number_of_episodes
              : undefined,
          avgSizeLabel: formatAvgSize(entry.avg_episode_size) || undefined,
        };

        const list = bySeason.get(season) ?? [];
        list.push(option);
        bySeason.set(season, list);
      }
    }
  }

  return [...bySeason.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([season, options]) => ({
      season,
      options: options.sort((a, b) => {
        if (a.edition !== b.edition) return a.edition.localeCompare(b.edition);
        return a.quality.localeCompare(b.quality);
      }),
    }));
}

function mapRow(row: unknown[], index: number, baseUrl: string): CatalogItem | null {
  if (!Array.isArray(row) || row.length < 8) return null;

  const imdbId = String(row[0] ?? '').trim();
  const type = String(row[1] ?? '').trim().toLowerCase();
  const title = String(row[2] ?? '').trim();
  const titleFa = String(row[3] ?? '').trim();
  const yearRaw = row[4];
  const ratingRaw = row[5];
  const votesRaw = row[6];
  const sourcesMap = row[7];

  if (!imdbId || !title || !sourcesMap || typeof sourcesMap !== 'object') {
    return null;
  }

  const year =
    typeof yearRaw === 'number' && Number.isFinite(yearRaw) ? yearRaw : null;
  const imdbRating =
    typeof ratingRaw === 'number' && Number.isFinite(ratingRaw)
      ? ratingRaw
      : null;
  const imdbVotes =
    typeof votesRaw === 'number' && Number.isFinite(votesRaw)
      ? votesRaw
      : null;

  if (type === 'series') {
    const seasons = mapSeriesSeasons(
      sourcesMap as Record<string, unknown>,
      baseUrl,
    );
    // A few archive rows are labeled series but only have movie-style file links.
    const urls =
      seasons.length === 0
        ? mapMovieSources(sourcesMap as Record<string, unknown>, baseUrl)
        : [];
    return {
      index: index + 1,
      title,
      titleFa: titleFa || undefined,
      year: year ?? undefined,
      imdbId,
      type: seasons.length === 0 && urls.length > 0 ? 'movie' : type,
      imdbVotes,
      imdbRating,
      urls,
      seasons: seasons.length > 0 ? seasons : undefined,
    };
  }

  return {
    index: index + 1,
    title,
    titleFa: titleFa || undefined,
    year: year ?? undefined,
    imdbId,
    type,
    imdbVotes,
    imdbRating,
    urls: mapMovieSources(sourcesMap as Record<string, unknown>, baseUrl),
  };
}

function evalArchiveData(source: string): unknown {
  // Happy path: archive is (or starts with) `let data = [...]` — avoid a full
  // bracket scan + substring copy of a multi‑MB file.
  try {
    return new Function(`${source}; return data;`)();
  } catch {
    const assignment = extractDataAssignment(source);
    try {
      return new Function(`${assignment}; return data;`)();
    } catch {
      throw new Error('PARSE_EMPTY');
    }
  }
}

export function parseArchiveJs(source: string, baseUrl: string): CatalogItem[] {
  assertValidArchiveJs(source);

  let data: unknown;
  try {
    data = evalArchiveData(source);
  } catch {
    throw new Error('PARSE_EMPTY');
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('PARSE_EMPTY');
  }

  const items: CatalogItem[] = [];
  for (let i = 0; i < data.length; i += 1) {
    const row = data[i];
    if (!Array.isArray(row)) continue;
    const item = mapRow(row, i, baseUrl);
    if (item) items.push(item);
  }

  if (items.length === 0) {
    throw new Error('PARSE_EMPTY');
  }

  return items;
}

/**
 * Background parse: eval only when idle, then map rows in large chunks.
 * `eval` of the full archive cannot be chunked — it runs as one idle block.
 */
export async function parseArchiveJsWhenIdle(
  source: string,
  baseUrl: string,
  options?: { isBusy?: () => boolean; chunkSize?: number },
): Promise<CatalogItem[]> {
  const isBusy = options?.isBusy;
  const chunkSize = options?.chunkSize ?? 1200;

  assertValidArchiveJs(source);
  await waitUntilIdle(isBusy);

  let data: unknown;
  try {
    data = evalArchiveData(source);
  } catch {
    throw new Error('PARSE_EMPTY');
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('PARSE_EMPTY');
  }

  const items: CatalogItem[] = [];
  for (let i = 0; i < data.length; i += 1) {
    const row = data[i];
    if (Array.isArray(row)) {
      const item = mapRow(row, i, baseUrl);
      if (item) items.push(item);
    }
    if ((i + 1) % chunkSize === 0) {
      await waitUntilIdle(isBusy);
      await paintTick();
    }
  }

  if (items.length === 0) {
    throw new Error('PARSE_EMPTY');
  }

  return items;
}
