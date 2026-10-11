/**
 * IMDb suggestion → official poster URL / image bytes.
 * Used by Vercel `/api/poster-image`, local sidecar, and Iran host.
 */
const IMDB_ID_RE = /^tt\d{5,}$/i;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_CONCURRENCY = 4;
const USER_AGENT =
  'Mozilla/5.0 (compatible; MrDivMovie/1.0; +https://github.com/davoodhobabi/MR_Div_Movie)';

const urlCache = new Map(); // id -> string | null
const imageCache = new Map(); // id -> { body, contentType }
const inflightUrl = new Map();
const inflightImage = new Map();
let active = 0;
const waiters = [];

function normalizeImdbId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function suggestionUrl(imdbId) {
  const id = normalizeImdbId(imdbId);
  const first = id[0] || 't';
  return `https://v2.sg.media-imdb.com/suggestion/${first}/${id}.json`;
}

/** Prefer a compact poster suitable for grid cards. */
function compactPosterUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (!/^https:\/\/m\.media-amazon\.com\//i.test(url)) return url;
  return url.replace(/\._V1_[^./]*\.(jpe?g|png|webp)$/i, '._V1_UX342.$1');
}

async function acquire() {
  if (active >= MAX_CONCURRENCY) {
    await new Promise((resolve) => waiters.push(resolve));
  }
  active += 1;
}

function release() {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}

async function lookupImdbPosterUrl(imdbId) {
  const id = normalizeImdbId(imdbId);
  if (!IMDB_ID_RE.test(id)) return null;
  if (urlCache.has(id)) return urlCache.get(id);

  const pending = inflightUrl.get(id);
  if (pending) return pending;

  const job = (async () => {
    await acquire();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(suggestionUrl(id), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const data = await response.json();
      const rows = Array.isArray(data?.d) ? data.d : [];
      const hit =
        rows.find((row) => normalizeImdbId(row?.id) === id) || rows[0];
      const imageUrl = hit?.i?.imageUrl;
      if (typeof imageUrl !== 'string' || !imageUrl.startsWith('https://')) {
        urlCache.set(id, null);
        return null;
      }
      const compact = compactPosterUrl(imageUrl) || imageUrl;
      urlCache.set(id, compact);
      return compact;
    } finally {
      clearTimeout(timer);
      release();
      inflightUrl.delete(id);
    }
  })();

  inflightUrl.set(id, job);
  return job;
}

async function fetchPosterBytes(imdbId) {
  const id = normalizeImdbId(imdbId);
  if (imageCache.has(id)) return imageCache.get(id);

  const pending = inflightImage.get(id);
  if (pending) return pending;

  const job = (async () => {
    const posterUrl = await lookupImdbPosterUrl(id);
    if (!posterUrl) return null;

    await acquire();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const image = await fetch(posterUrl, {
        method: 'GET',
        headers: {
          Accept: 'image/*',
          'User-Agent': USER_AGENT,
          Referer: 'https://www.imdb.com/',
        },
        signal: controller.signal,
      });
      if (!image.ok) throw new Error(`HTTP_${image.status}`);
      const body = Buffer.from(await image.arrayBuffer());
      const row = {
        body,
        contentType: image.headers.get('content-type') || 'image/jpeg',
      };
      imageCache.set(id, row);
      return row;
    } finally {
      clearTimeout(timer);
      release();
      inflightImage.delete(id);
    }
  })();

  inflightImage.set(id, job);
  return job;
}

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
}

function requestUrl(req) {
  const raw = req.url || '/';
  if (/^https?:\/\//i.test(raw)) return new URL(raw);
  const host = req.headers.host || 'localhost';
  return new URL(raw, `http://${host}`);
}

/**
 * GET /api/poster-image?id=tt0111161
 * Streams the IMDb poster so browsers never CORS-hit Amazon/IMDb JSON.
 */
async function handlePosterImage(req, res, options = {}) {
  const parsed = requestUrl(req);
  if (!options.force && parsed.pathname !== '/api/poster-image') {
    return false;
  }

  applyCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.end('METHOD');
    return true;
  }

  const id = normalizeImdbId(parsed.searchParams.get('id') || '');
  if (!IMDB_ID_RE.test(id)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('BAD_ID');
    return true;
  }

  try {
    const row = await fetchPosterBytes(id);
    if (!row) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end('NOT_FOUND');
      return true;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', row.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', String(row.body.length));
      res.end();
    } else {
      res.end(row.body);
    }
  } catch (err) {
    const aborted =
      err instanceof Error &&
      (err.name === 'AbortError' || /aborted|timeout/i.test(err.message));
    const upstream =
      err instanceof Error && /^HTTP_\d+/.test(err.message);
    res.statusCode = aborted ? 504 : upstream ? 502 : 502;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(aborted ? 'TIMEOUT' : 'UNKNOWN');
  }

  return true;
}

module.exports = {
  IMDB_ID_RE,
  normalizeImdbId,
  lookupImdbPosterUrl,
  compactPosterUrl,
  handlePosterImage,
};
