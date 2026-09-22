/**
 * Same-origin proxy for catalog hosts that omit CORS.
 * Native fetch is unchanged; browsers go through /api/folder-listing and
 * /api/media-resolve (local sidecar on 8787 during `expo start`).
 */
const http = require('http');

const ALLOWED_HOST = /^dls\d*\.aparatchi-dlcenter\.top$/i;
const STORAGE_HOST = /\.hashuresport\.com$/i;
const FETCH_TIMEOUT_MS = 120_000;
const PATH = '/api/episodes';
const PATH_LEGACY = '/api/folder-listing';
const RESOLVE_PATH = '/api/media-resolve';
const RANGE_PATH = '/api/media-range';
const DEV_PROXY_PORT = 8787;
const MAX_RANGE_BYTES = 2_500_000;

function send(res, status, body, contentType) {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType || 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(typeof body === 'string' ? body : String(body ?? ''));
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function allowedTarget(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (!ALLOWED_HOST.test(url.hostname) && !STORAGE_HOST.test(url.hostname)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function requestUrl(req) {
  const raw = req.url || '/';
  if (/^https?:\/\//i.test(raw)) return new URL(raw);
  const host = req.headers.host || 'localhost';
  return new URL(raw, `http://${host}`);
}

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type, Range');
}

async function handleFolderListing(req, res, options = {}) {
  const parsed = requestUrl(req);
  if (
    !options.force &&
    parsed.pathname !== PATH &&
    parsed.pathname !== PATH_LEGACY
  ) {
    return false;
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'METHOD');
    return true;
  }

  const target = allowedTarget(parsed.searchParams.get('url') || '');
  if (!target) {
    send(res, 400, 'EMPTY_URL');
    return true;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,*/*',
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    const html = await response.text();
    send(
      res,
      response.status,
      html,
      response.headers.get('content-type') || 'text/html; charset=utf-8',
    );
  } catch (err) {
    const aborted =
      err instanceof Error &&
      (err.name === 'AbortError' || /aborted|timeout/i.test(err.message));
    send(res, aborted ? 504 : 502, aborted ? 'TIMEOUT' : 'UNKNOWN');
  } finally {
    clearTimeout(timer);
  }

  return true;
}

async function handleMediaResolve(req, res, options = {}) {
  const parsed = requestUrl(req);
  if (!options.force && parsed.pathname !== RESOLVE_PATH) return false;

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'METHOD');
    return true;
  }

  const target = allowedTarget(parsed.searchParams.get('url') || '');
  if (!target) {
    sendJson(res, 400, { error: 'EMPTY_URL' });
    return true;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: {
        Range: 'bytes=0-0',
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    await response.arrayBuffer().catch(() => undefined);
    const finalUrl = response.url || target;
    if (!/^https:\/\//i.test(finalUrl)) {
      sendJson(res, 502, { error: 'UNKNOWN' });
      return true;
    }
    // Non-Iran IPs often get 503 or no 302; returning the catalog host is
    // useless for browsers (CORS blocks Range reads on that redirect).
    if (!response.ok && response.status !== 206) {
      sendJson(res, response.status === 503 ? 503 : 502, {
        error: response.status === 503 ? 'IRAN_IP_REQUIRED' : `HTTP_${response.status}`,
      });
      return true;
    }
    let hostname = '';
    try {
      hostname = new URL(finalUrl).hostname;
    } catch {
      sendJson(res, 502, { error: 'UNKNOWN' });
      return true;
    }
    if (ALLOWED_HOST.test(hostname)) {
      sendJson(res, 502, { error: 'NO_REDIRECT' });
      return true;
    }
    sendJson(res, 200, { url: finalUrl });
  } catch (err) {
    const aborted =
      err instanceof Error &&
      (err.name === 'AbortError' || /aborted|timeout/i.test(err.message));
    sendJson(res, aborted ? 504 : 502, {
      error: aborted ? 'TIMEOUT' : 'UNKNOWN',
    });
  } finally {
    clearTimeout(timer);
  }

  return true;
}

async function handleMediaRange(req, res, options = {}) {
  const parsed = requestUrl(req);
  if (!options.force && parsed.pathname !== RANGE_PATH) return false;

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'METHOD');
    return true;
  }

  const target = allowedTarget(parsed.searchParams.get('url') || '');
  if (!target) {
    send(res, 400, 'EMPTY_URL');
    return true;
  }

  const range = String(req.headers.range || '');
  if (!/^bytes=\d+-\d+$/i.test(range)) {
    send(res, 400, 'RANGE');
    return true;
  }
  const [start, end] = range.replace(/^bytes=/i, '').split('-').map(Number);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    send(res, 400, 'RANGE');
    return true;
  }
  if (end - start + 1 > MAX_RANGE_BYTES) {
    send(res, 400, 'RANGE_TOO_LARGE');
    return true;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: {
        Range: range,
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    const body = Buffer.from(await response.arrayBuffer());
    if (!response.ok && response.status !== 206) {
      send(
        res,
        response.status === 503 ? 503 : response.status,
        response.status === 503 ? 'IRAN_IP_REQUIRED' : `HTTP_${response.status}`,
      );
      return true;
    }
    res.statusCode = response.status;
    res.setHeader(
      'Content-Type',
      response.headers.get('content-type') || 'application/octet-stream',
    );
    const contentRange = response.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  } catch (err) {
    const aborted =
      err instanceof Error &&
      (err.name === 'AbortError' || /aborted|timeout/i.test(err.message));
    send(res, aborted ? 504 : 502, aborted ? 'TIMEOUT' : 'UNKNOWN');
  } finally {
    clearTimeout(timer);
  }

  return true;
}

function startLocalFolderProxy(port = DEV_PROXY_PORT) {
  if (global.__dmovieFolderProxyStarted) return port;
  const server = http.createServer((req, res) => {
    applyCors(res);
    void handleFolderListing(req, res)
      .then((handled) => (handled ? true : handleMediaResolve(req, res)))
      .then((handled) => (handled ? true : handleMediaRange(req, res)))
      .then((handled) => {
        if (handled) return;
        res.statusCode = 404;
        res.end('NOT_FOUND');
      })
      .catch(() => {
        if (!res.headersSent) {
          res.statusCode = 502;
          res.end('UNKNOWN');
        }
      });
  });
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      global.__dmovieFolderProxyStarted = true;
      console.log(`[folder-listing] proxy already listening on ${port}`);
      return;
    }
    console.warn('[folder-listing] proxy failed to start', err);
  });
  server.listen(port, '0.0.0.0', () => {
    global.__dmovieFolderProxyStarted = true;
    console.log(`[folder-listing] proxy http://localhost:${port}${PATH}`);
  });
  return port;
}

module.exports = {
  PATH,
  RESOLVE_PATH,
  RANGE_PATH,
  DEV_PROXY_PORT,
  handleFolderListing,
  handleMediaResolve,
  handleMediaRange,
  startLocalFolderProxy,
};
