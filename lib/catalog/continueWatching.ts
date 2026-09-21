import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CatalogEdition } from './types';

const CONTINUE_KEY = 'dmovie.continueWatching.v1';
const MAX_ENTRIES = 30;
const MIN_SECONDS = 20;
const MIN_RATIO = 0.02;
const COMPLETE_RATIO = 0.92;

export type ContinueWatchingEntry = {
  imdbId: string;
  uri: string;
  key: string;
  sourceTitle: string;
  edition: CatalogEdition;
  referer?: string;
  position: number;
  duration: number;
  updatedAt: number;
};

export function isUnfinished(position: number, duration: number): boolean {
  if (!Number.isFinite(position) || position < MIN_SECONDS) return false;
  if (Number.isFinite(duration) && duration > 30) {
    const ratio = position / duration;
    if (ratio >= COMPLETE_RATIO) return false;
    if (ratio < MIN_RATIO && position < 45) return false;
  }
  return true;
}

function parseEntries(raw: string | null): ContinueWatchingEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries: ContinueWatchingEntry[] = [];
    const seen = new Set<string>();
    for (const value of parsed) {
      if (!value || typeof value !== 'object') continue;
      const item = value as Partial<ContinueWatchingEntry>;
      const imdbId = typeof item.imdbId === 'string' ? item.imdbId.trim() : '';
      const uri = typeof item.uri === 'string' ? item.uri.trim() : '';
      if (!imdbId || !uri || seen.has(imdbId)) continue;
      const position = Number(item.position);
      const duration = Number(item.duration);
      if (!isUnfinished(position, duration)) continue;
      seen.add(imdbId);
      entries.push({
        imdbId,
        uri,
        key: typeof item.key === 'string' && item.key.trim() ? item.key : uri,
        sourceTitle:
          typeof item.sourceTitle === 'string' ? item.sourceTitle : '',
        edition:
          item.edition === 'Dubbed' || item.edition === 'NoSub'
            ? item.edition
            : 'SoftSub',
        referer:
          typeof item.referer === 'string' && item.referer.trim()
            ? item.referer
            : undefined,
        position,
        duration: Number.isFinite(duration) ? duration : 0,
        updatedAt:
          typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
      });
    }
    return entries;
  } catch {
    return [];
  }
}

export async function getContinueWatching(): Promise<ContinueWatchingEntry[]> {
  try {
    return parseEntries(await AsyncStorage.getItem(CONTINUE_KEY));
  } catch {
    return [];
  }
}

export async function persistContinueWatching(
  entries: ContinueWatchingEntry[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(CONTINUE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore persistence failures; caller still has the in-memory value.
  }
}

export function upsertContinueWatching(
  entries: ContinueWatchingEntry[],
  next: ContinueWatchingEntry,
): ContinueWatchingEntry[] {
  const rest = entries.filter((item) => item.imdbId !== next.imdbId);
  if (!isUnfinished(next.position, next.duration)) {
    return rest;
  }
  return [next, ...rest].slice(0, MAX_ENTRIES);
}

export function removeContinueWatching(
  entries: ContinueWatchingEntry[],
  imdbId: string,
): ContinueWatchingEntry[] {
  const id = imdbId.trim();
  if (!id) return entries;
  const next = entries.filter((item) => item.imdbId !== id);
  return next.length === entries.length ? entries : next;
}
