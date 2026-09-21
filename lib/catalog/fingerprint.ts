/** Cheap content fingerprint: length + head/mid/tail samples. */
export function archiveFingerprint(source: string): string {
  const len = source.length;
  const head = source.slice(0, 96);
  const mid = source.slice(
    Math.max(0, Math.floor(len / 2) - 48),
    Math.floor(len / 2) + 48,
  );
  const tail = source.slice(-96);
  return `${len}:${head}:${mid}:${tail}`;
}
