/**
 * One Node process for cPanel:
 *   /api/*  → subtitle / listing / range
 *   other   → Expo web SPA (dist/)
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { extractMkvTextSubtitles } = require('./mkvSubtitles.js');
const {
  handleFolderListing,
  handleMediaResolve,
  handleMediaRange,
} = require('./folderListingProxy.cjs');
const { handleMediaStream, ffmpegAvailable, getFfmpegPath } = require('./mediaStream.cjs');
const { handleMediaHls } = require('./mediaHls.cjs');
const { handlePosterImage } = require('./imdbPoster.cjs');

const PORT = Number(process.env.PORT || 3000);
const DIST = path.join(__dirname, 'dist');
const ALLOWED =
  /^https:\/\/(dls\d*\.aparatchi-dlcenter\.top|\S+\.hashuresport\.com)\//i;

/** Served from dist/downloads after the web export (public/downloads). */
const DOWNLOAD_FILES = {
  '/downloads/android-tv.apk': 'android-tv.apk',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive',
};

function log(...args) {
  console.log(`[dmovie-host ${new Date().toISOString()}]`, ...args);
}

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type, Range');
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  if (ext === '.html') res.setHeader('Cache-Control', 'no-store');
  else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  fs.createReadStream(filePath).pipe(res);
}

function sendIndex(res) {
  sendFile(res, path.join(DIST, 'index.html'));
}

function safeDistFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded.replace(/^\/+/, '');
  if (!relative) return path.join(DIST, 'index.html');
  const full = path.normalize(path.join(DIST, relative));
  if (!full.startsWith(DIST)) return null;
  return full;
}

async function handleHealth(req, res, parsed) {
  if (parsed.pathname !== '/health') return false;
  sendJson(res, 200, {
    ok: true,
    service: 'dmovie-host',
    ffmpeg: ffmpegAvailable(),
    ffmpegPath: getFfmpegPath() || null,
  });
  return true;
}

async function handleSubtitles(req, res, parsed) {
  if (parsed.pathname !== '/api/subtitles') return false;
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'METHOD' });
    return true;
  }
  const target = parsed.searchParams.get('url') || '';
  if (!ALLOWED.test(target)) {
    log('extract reject', target.slice(0, 120));
    sendJson(res, 400, { error: 'BAD_URL' });
    return true;
  }
  log('extract start', target);
  const started = Date.now();
  try {
    const tracks = await extractMkvTextSubtitles(target);
    const cues = tracks.reduce(
      (n, t) => n + (String(t.vtt || '').match(/-->/g) || []).length,
      0,
    );
    log('extract ok', `tracks=${tracks.length}`, `cues=${cues}`, `ms=${Date.now() - started}`);
    sendJson(res, 200, { tracks });
  } catch (err) {
    log('extract fail', err instanceof Error ? err.message : String(err));
    sendJson(res, 502, {
      error: 'EXTRACT_FAIL',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
  return true;
}

function handleDownloads(req, res, parsed) {
  const mapped = DOWNLOAD_FILES[parsed.pathname];
  if (!mapped) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.end('METHOD');
    return true;
  }
  const downloadsDir = path.join(DIST, 'downloads');
  const filePath = path.join(downloadsDir, mapped);
  if (!filePath.startsWith(downloadsDir) || !fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.end('NOT_FOUND');
    return true;
  }
  const stat = fs.statSync(filePath);
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME['.apk']);
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${path.basename(parsed.pathname)}"`,
  );
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function handleStatic(req, res, parsed) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.end('METHOD');
    return true;
  }
  const filePath = safeDistFile(parsed.pathname);
  if (!filePath) {
    res.statusCode = 400;
    res.end('BAD_PATH');
    return true;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(res, filePath);
    return true;
  }
  sendIndex(res);
  return true;
}

const server = http.createServer((req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const parsed = new URL(req.url || '/', `http://${host}`);
  const isApi = parsed.pathname === '/health' || parsed.pathname.startsWith('/api/');
  if (isApi) applyCors(res);
  if (isApi) {
    log(req.method, parsed.pathname, parsed.searchParams.get('url') || '', req.headers.range || '');
  }

  void handleHealth(req, res, parsed)
    .then((handled) => (handled ? true : handleSubtitles(req, res, parsed)))
    .then((handled) => (handled ? true : handlePosterImage(req, res)))
    .then((handled) => (handled ? true : handleFolderListing(req, res)))
    .then((handled) => (handled ? true : handleMediaResolve(req, res)))
    .then((handled) => (handled ? true : handleMediaRange(req, res)))
    .then((handled) => (handled ? true : handleMediaStream(req, res)))
    .then((handled) => (handled ? true : handleMediaHls(req, res)))
    .then((handled) => {
      if (handled) return true;
      return handleDownloads(req, res, parsed);
    })
    .then((handled) => {
      if (handled) return;
      handleStatic(req, res, parsed);
    })
    .catch((err) => {
      log('handler error', err instanceof Error ? err.message : String(err));
      if (!res.headersSent) {
        res.statusCode = 502;
        res.end('UNKNOWN');
      }
    });
});

server.listen(PORT, '0.0.0.0', () => {
  log(`listening http://0.0.0.0:${PORT}`);
});
