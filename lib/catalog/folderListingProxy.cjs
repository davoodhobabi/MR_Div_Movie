/**
 * Same-origin proxy for Apache/nginx autoindex HTML.
 * Browsers cannot read catalog folder listings (no CORS); native fetch can.
 */
const http = require('http');

const ALLOWED_HOST = /^dls\d*\.aparatchi-dlcenter\.top$/i;
const FETCH_TIMEOUT_MS = 120_000;
const PATH = '/api/folder-listing';
const DEV_PROXY_PORT = 8787;

function send(res, status, body, contentType) {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType || 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(typeof body === 'string' ? body : String(body ?? ''));
}

function allowedTarget(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (!ALLOWED_HOST.test(url.hostname)) return null;
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

async function handleFolderListing(req, res, options = {}) {
  const parsed = requestUrl(req);
  if (!options.force && parsed.pathname !== PATH) return false;

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

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept');
}

function startLocalFolderProxy(port = DEV_PROXY_PORT) {
  if (global.__dmovieFolderProxyStarted) return port;
  const server = http.createServer((req, res) => {
    applyCors(res);
    void handleFolderListing(req, res)
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
  DEV_PROXY_PORT,
  handleFolderListing,
  startLocalFolderProxy,
};
