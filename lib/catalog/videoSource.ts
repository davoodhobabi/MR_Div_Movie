/** Encode each path segment so filenames with spaces/unicode still stream. */
export function encodeMediaUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    url.pathname = url.pathname
      .split('/')
      .map((segment) => {
        if (!segment) return segment;
        try {
          return encodeURIComponent(decodeURIComponent(segment));
        } catch {
          return encodeURIComponent(segment);
        }
      })
      .join('/');
    return url.toString();
  } catch {
    return raw.trim();
  }
}
