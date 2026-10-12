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

/**
 * HTML5 `<video>` cannot demux Matroska/AVI. On web we remux these through
 * `/api/media-stream` (ffmpeg stream-copy → fragmented MP4) for Safari/iPhone.
 */
export function isHtml5UnsupportedMediaUrl(raw: string): boolean {
  try {
    const path = new URL(raw.trim()).pathname.toLowerCase();
    return /\.(mkv|avi|wmv|flv|ts|m2ts)$/i.test(path);
  } catch {
    return /\.(mkv|avi|wmv|flv|ts|m2ts)(?:$|\?)/i.test(raw);
  }
}

/** URI passed to expo-video. Web plays the original file; iPhone MKV remux is opt-in. */
export function resolvePlaybackUrl(raw: string): string {
  return encodeMediaUrl(raw);
}
