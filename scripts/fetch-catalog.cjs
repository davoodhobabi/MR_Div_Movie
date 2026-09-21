#!/usr/bin/env node
/**
 * Build-time catalog fetch: download archive.js → parse → indexed JSON for the app bundle.
 *
 *   node scripts/fetch-catalog.mjs
 *   CATALOG_URL=... node scripts/fetch-catalog.mjs
 *   CATALOG_SOURCE_FILE=/path/to/10_thous.js node scripts/fetch-catalog.mjs
 *
 * Falls back to data/catalog.items.json (searchKey only) if download is blocked.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'lib/catalog/data');
const OUT_FILE = path.join(OUT_DIR, 'bundledCatalog.json');
const META_FILE = path.join(OUT_DIR, 'bundledCatalog.meta.json');
const FALLBACK_ITEMS = path.join(ROOT, 'data/catalog.items.json');

const DEFAULT_BASE_URL = 'https://dls6.aparatchi-dlcenter.top/';
const CATALOG_JS_PATH = 'DonyayeSerial/10_thous.js';
const DEFAULT_URL = new URL(CATALOG_JS_PATH, DEFAULT_BASE_URL).toString();

const CATALOG_EDITIONS = ['SoftSub', 'Dubbed', 'NoSub'];

function isEdition(value) {
  return CATALOG_EDITIONS.includes(value);
}

function formatQuality(raw) {
  return String(raw).replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

function formatAvgSize(bytes) {
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

function formatMovieSize(raw) {
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

function resolveUrl(raw, baseUrl) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return trimmed;
  }
}

function mapMovieSources(sourcesMap, baseUrl) {
  const out = [];
  for (const group of Object.values(sourcesMap)) {
    if (!Array.isArray(group)) continue;
    for (const entry of group) {
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

function mapSeriesSeasons(sourcesMap, baseUrl) {
  const bySeason = new Map();
  for (const seasonMap of Object.values(sourcesMap)) {
    if (!seasonMap || typeof seasonMap !== 'object' || Array.isArray(seasonMap)) {
      continue;
    }
    for (const group of Object.values(seasonMap)) {
      if (!Array.isArray(group)) continue;
      for (const entry of group) {
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
        const option = {
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

function mapRow(row, index, baseUrl) {
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
    typeof yearRaw === 'number' && Number.isFinite(yearRaw) ? yearRaw : undefined;
  const imdbRating =
    typeof ratingRaw === 'number' && Number.isFinite(ratingRaw)
      ? ratingRaw
      : null;
  const imdbVotes =
    typeof votesRaw === 'number' && Number.isFinite(votesRaw) ? votesRaw : null;

  if (type === 'series') {
    const seasons = mapSeriesSeasons(sourcesMap, baseUrl);
    const urls =
      seasons.length === 0 ? mapMovieSources(sourcesMap, baseUrl) : [];
    return {
      index: index + 1,
      title,
      titleFa: titleFa || undefined,
      year,
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
    year,
    imdbId,
    type,
    imdbVotes,
    imdbRating,
    urls: mapMovieSources(sourcesMap, baseUrl),
  };
}

function buildSearchKey(item) {
  return [
    item.title,
    item.titleFa ?? '',
    item.imdbId,
    item.type,
    item.year != null ? String(item.year) : '',
  ]
    .join(' ')
    .toLowerCase();
}

function indexItems(items) {
  return items.map((item) => ({
    ...item,
    searchKey: buildSearchKey(item),
  }));
}

function evalArchiveData(source) {
  try {
    return new Function(`${source}; return data;`)();
  } catch {
    const marker = source.match(/let\s+data\s*=\s*/);
    if (!marker || marker.index == null) throw new Error('PARSE_EMPTY');
    const start = source.indexOf('[', marker.index + marker[0].length);
    if (start < 0) throw new Error('PARSE_EMPTY');
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
    if (end < 0) throw new Error('PARSE_EMPTY');
    return new Function(
      `let data = ${source.slice(start, end + 1)}; return data;`,
    )();
  }
}

function parseArchiveJs(source, baseUrl) {
  if (!source || source.length < 100) throw new Error('EMPTY_HTML');
  const looksBlocked =
    /آی\s*پی\s*داخلی|Service Unavailable|vpn|پروکسی/i.test(source) &&
    !/let\s+data\s*=/.test(source);
  if (looksBlocked) throw new Error('IRAN_IP_REQUIRED');

  const data = evalArchiveData(source);
  if (!Array.isArray(data) || data.length === 0) throw new Error('PARSE_EMPTY');

  const items = [];
  for (let i = 0; i < data.length; i += 1) {
    const row = data[i];
    if (!Array.isArray(row)) continue;
    const item = mapRow(row, i, baseUrl);
    if (item) items.push(item);
  }
  if (items.length === 0) throw new Error('PARSE_EMPTY');
  return items;
}

function download(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          Accept: 'application/javascript,text/javascript,text/plain,*/*',
          'User-Agent':
            'Mozilla/5.0 (compatible; DMovieCatalogFetch/1.0; +local-build)',
        },
        timeout: 180_000,
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          download(new URL(res.headers.location, url).toString())
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP_${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('TIMEOUT'));
    });
  });
}

function writeBundle(items, meta) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const json = JSON.stringify(items);
  fs.writeFileSync(OUT_FILE, json);
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
  const mb = (Buffer.byteLength(json) / (1024 * 1024)).toFixed(2);
  console.log(
    `[fetch-catalog] wrote ${items.length} items (${mb} MB) → ${path.relative(ROOT, OUT_FILE)}`,
  );
  console.log(`[fetch-catalog] meta → ${path.relative(ROOT, META_FILE)}`);
}

function fromFallbackItems() {
  if (!fs.existsSync(FALLBACK_ITEMS)) {
    throw new Error(
      'No network catalog and no data/catalog.items.json fallback',
    );
  }
  console.warn(
    '[fetch-catalog] using fallback data/catalog.items.json (may lack titleFa/seasons)',
  );
  const raw = JSON.parse(fs.readFileSync(FALLBACK_ITEMS, 'utf8'));
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('FALLBACK_EMPTY');
  }
  return indexItems(raw);
}

async function main() {
  const baseUrl = process.env.CATALOG_BASE_URL || DEFAULT_BASE_URL;
  const sourceFile = process.env.CATALOG_SOURCE_FILE;
  const url = process.env.CATALOG_URL || DEFAULT_URL;

  let items;
  let source = 'download';

  if (sourceFile) {
    console.log(`[fetch-catalog] reading ${sourceFile}`);
    const text = fs.readFileSync(sourceFile, 'utf8');
    items = indexItems(parseArchiveJs(text, baseUrl));
    source = sourceFile;
  } else {
    try {
      console.log(`[fetch-catalog] downloading ${url}`);
      const text = await download(url);
      items = indexItems(parseArchiveJs(text, baseUrl));
      source = url;
    } catch (err) {
      console.warn(`[fetch-catalog] download failed: ${err.message}`);
      if (fs.existsSync(OUT_FILE)) {
        const existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
        if (Array.isArray(existing) && existing.length > 0) {
          console.warn(
            `[fetch-catalog] keeping existing bundle (${existing.length} items)`,
          );
          return;
        }
      }
      items = fromFallbackItems();
      source = 'fallback:data/catalog.items.json';
    }
  }

  writeBundle(items, {
    generatedAt: new Date().toISOString(),
    source,
    baseUrl,
    count: items.length,
  });
}

main().catch((err) => {
  console.error('[fetch-catalog] FATAL', err);
  process.exit(1);
});
