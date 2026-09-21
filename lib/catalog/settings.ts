export const DEFAULT_BASE_URL = 'https://dls6.aparatchi-dlcenter.top/';
export const CATALOG_JS_PATH = 'DonyayeSerial/10_thous.js';

export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('EMPTY_URL');
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error('INVALID_URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('INVALID_URL');
  }

  let pathname = parsed.pathname || '/';
  if (/\.(js|html?)$/i.test(pathname)) {
    pathname = pathname.replace(/[^/]+$/, '');
  }
  if (!pathname.endsWith('/')) {
    pathname += '/';
  }

  return `${parsed.origin}${pathname}`;
}

export function buildCatalogUrl(baseUrl: string): string {
  return new URL(CATALOG_JS_PATH, normalizeBaseUrl(baseUrl)).toString();
}
