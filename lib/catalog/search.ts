import type { IndexedCatalogItem } from './types';

const RESULT_LIMIT = 40;

export function findByImdbId(
  items: IndexedCatalogItem[],
  imdbId: string,
): IndexedCatalogItem | undefined {
  return items.find((item) => item.imdbId === imdbId);
}

export function findManyByImdbIds(
  items: IndexedCatalogItem[],
  ids: string[],
): IndexedCatalogItem[] {
  const byId = new Map<string, IndexedCatalogItem>();
  for (const item of items) {
    if (!byId.has(item.imdbId)) {
      byId.set(item.imdbId, item);
    }
  }
  const found: IndexedCatalogItem[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item) found.push(item);
  }
  return found;
}

export function searchCatalog(
  items: IndexedCatalogItem[],
  query: string,
): IndexedCatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const starts: IndexedCatalogItem[] = [];
  const contains: IndexedCatalogItem[] = [];

  for (const item of items) {
    if (!item.searchKey.includes(q)) continue;
    const title = item.title.toLowerCase();
    const titleFa = (item.titleFa ?? '').toLowerCase();
    if (
      item.searchKey.startsWith(q) ||
      title.startsWith(q) ||
      titleFa.startsWith(q)
    ) {
      starts.push(item);
    } else {
      contains.push(item);
    }
    if (starts.length >= RESULT_LIMIT) break;
  }

  return starts.concat(contains).slice(0, RESULT_LIMIT);
}

export function filterCatalog(
  items: IndexedCatalogItem[],
  query: string,
): IndexedCatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => item.searchKey.includes(q));
}
