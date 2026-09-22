/** Forward /api/* to the Iran Node host. Browser stays on HTTPS Vercel. */
const UPSTREAM = (
  process.env.SUBTITLE_PROXY_ORIGIN || 'http://movie.mr-div.ir'
).replace(/\/$/, '');

function requestPath(req) {
  const raw = req.url || '/';
  if (/^https?:\/\//i.test(raw)) {
    const parsed = new URL(raw);
    return `${parsed.pathname}${parsed.search}`;
  }
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  // BitNinja on the Iran host 403s "/api/folder-listing".
  return path.replace('/api/folder-listing', '/api/episodes');
}

async function proxyIran(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type, Range');
    res.end();
    return;
  }

  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.end('METHOD');
    return;
  }

  const target = `${UPSTREAM}${requestPath(req)}`;
  const headers = {
    Accept: req.headers.accept || '*/*',
    'User-Agent':
      req.headers['user-agent'] ||
      'Mozilla/5.0 (compatible; DMovie-subtitle-proxy)',
  };
  if (req.headers.range) headers.Range = req.headers.range;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  try {
    const response = await fetch(target, {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });
    const body = Buffer.from(await response.arrayBuffer());
    res.statusCode = response.status;
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    const contentRange = response.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(body);
  } catch (err) {
    const aborted =
      err instanceof Error &&
      (err.name === 'AbortError' || /aborted|timeout/i.test(err.message));
    res.statusCode = aborted ? 504 : 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: aborted ? 'TIMEOUT' : 'UPSTREAM' }));
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { proxyIran, UPSTREAM };
