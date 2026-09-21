import type { IndexedCatalogItem } from './types';

export type PosterRow = {
  imdbId: string;
  remoteUrl: string | null;
  fileUri: string | null;
  updatedAt: number;
};

export async function getPoster(_imdbId: string): Promise<PosterRow | null> {
  return null;
}

export async function upsertPoster(
  _imdbId: string,
  _remoteUrl: string | null,
  _fileUri: string | null,
): Promise<void> {}

export async function getItemCount(): Promise<number> {
  return 0;
}

export async function loadAllItems(): Promise<IndexedCatalogItem[]> {
  return [];
}

export async function getMeta(_key: string): Promise<string | null> {
  return null;
}

export async function setMeta(_key: string, _value: string): Promise<void> {}

export async function replaceAllItems(
  _items: IndexedCatalogItem[],
  _meta?: { baseUrl?: string; archiveFingerprint?: string },
): Promise<void> {}

export async function clearCatalog(): Promise<void> {}
