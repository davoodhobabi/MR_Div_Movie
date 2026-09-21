import type { SubtitleTrack } from 'expo-video';

const PERSIAN = new Set([
  'fa',
  'fas',
  'per',
  'fa-ir',
  'fa_ir',
  'persian',
  'farsi',
  'فارسی',
]);

const ENGLISH = new Set([
  'en',
  'eng',
  'en-us',
  'en_us',
  'en-gb',
  'english',
  'انگلیسی',
]);

function norm(value?: string | null) {
  return (value || '').toLowerCase().trim();
}

function trackHaystack(track: SubtitleTrack) {
  return `${norm(track.language)} ${norm(track.label)} ${norm(track.name)}`;
}

function matchesSet(track: SubtitleTrack, langs: Set<string>) {
  const language = norm(track.language);
  if (langs.has(language)) return true;
  const hay = trackHaystack(track);
  for (const lang of langs) {
    if (hay.includes(lang)) return true;
  }
  return false;
}

export function pickPreferredNamedTrack<T extends { name: string }>(
  tracks: T[],
): T | null {
  if (!tracks.length) return null;
  const hay = (track: T) => norm(track.name);
  const matches = (track: T, langs: Set<string>) => {
    const text = hay(track);
    for (const lang of langs) {
      if (text === lang || text.includes(lang)) return true;
    }
    return false;
  };
  return (
    tracks.find((t) => matches(t, PERSIAN)) ||
    tracks.find((t) => matches(t, ENGLISH)) ||
    tracks[0]
  );
}

/** Prefer Persian SoftSub, then English, then default/auto, then first track. */
export function pickPreferredSubtitle(
  tracks: SubtitleTrack[],
): SubtitleTrack | null {
  if (!tracks.length) return null;
  return (
    tracks.find((t) => matchesSet(t, PERSIAN)) ||
    tracks.find((t) => matchesSet(t, ENGLISH)) ||
    tracks.find((t) => t.isDefault) ||
    tracks.find((t) => t.autoSelect) ||
    tracks[0]
  );
}

export function subtitleLabel(track: SubtitleTrack | null): string {
  if (!track) return '';
  return track.label || track.name || track.language || 'Sub';
}

/**
 * Cycle: off → preferred → next tracks → off.
 * Returns the next track to assign (null = off).
 */
export function nextSubtitleTrack(
  tracks: SubtitleTrack[],
  current: SubtitleTrack | null,
): SubtitleTrack | null {
  if (!tracks.length) return null;
  if (!current) {
    return pickPreferredSubtitle(tracks);
  }
  const currentId = current.id ?? subtitleLabel(current);
  const index = tracks.findIndex(
    (t) => (t.id ?? subtitleLabel(t)) === currentId,
  );
  if (index < 0) return tracks[0] ?? null;
  if (index >= tracks.length - 1) return null;
  return tracks[index + 1] ?? null;
}
