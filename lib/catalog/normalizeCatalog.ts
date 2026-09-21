import { paintTick, waitUntilIdle } from './idleWork';
import type {
  CatalogEdition,
  CatalogItem,
  CatalogSource,
  IndexedCatalogItem,
  SeriesQualityOption,
  SeriesSeason,
} from './types';
import { CATALOG_EDITIONS } from './types';

function isEdition(value: unknown): value is CatalogEdition {
  return (
    typeof value === 'string' &&
    (CATALOG_EDITIONS as readonly string[]).includes(value)
  );
}

function normalizeSource(value: unknown): CatalogSource | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<CatalogSource>;
  if (
    typeof source.title !== 'string' ||
    typeof source.url !== 'string' ||
    typeof source.size !== 'string' ||
    !isEdition(source.edition)
  ) {
    return null;
  }

  return {
    title: source.title.trim(),
    url: source.url.trim(),
    size: source.size.trim(),
    edition: source.edition,
  };
}

function normalizeQualityOption(value: unknown): SeriesQualityOption | null {
  if (!value || typeof value !== 'object') return null;
  const option = value as Partial<SeriesQualityOption>;
  if (
    !isEdition(option.edition) ||
    typeof option.quality !== 'string' ||
    typeof option.folderUrl !== 'string'
  ) {
    return null;
  }
  return {
    edition: option.edition,
    quality: option.quality.trim(),
    folderUrl: option.folderUrl.trim(),
    episodeCount:
      typeof option.episodeCount === 'number' && Number.isFinite(option.episodeCount)
        ? option.episodeCount
        : undefined,
    avgSizeLabel:
      typeof option.avgSizeLabel === 'string' ? option.avgSizeLabel.trim() : undefined,
  };
}

function normalizeSeason(value: unknown): SeriesSeason | null {
  if (!value || typeof value !== 'object') return null;
  const season = value as Partial<SeriesSeason>;
  if (typeof season.season !== 'number' || !Number.isFinite(season.season)) {
    return null;
  }
  const options = Array.isArray(season.options)
    ? season.options
        .map(normalizeQualityOption)
        .filter((option): option is SeriesQualityOption => option !== null)
    : [];
  return { season: season.season, options };
}

export function normalizeItem(value: CatalogItem): CatalogItem {
  const rawUrls = Array.isArray(value.urls) ? value.urls : [];
  const seasons = Array.isArray(value.seasons)
    ? value.seasons
        .map(normalizeSeason)
        .filter((season): season is SeriesSeason => season !== null)
    : undefined;

  return {
    ...value,
    titleFa: value.titleFa?.trim() || undefined,
    year:
      typeof value.year === 'number' && Number.isFinite(value.year)
        ? value.year
        : undefined,
    urls: rawUrls
      .map(normalizeSource)
      .filter((source): source is CatalogSource => source !== null),
    seasons: seasons && seasons.length > 0 ? seasons : undefined,
  };
}

export function buildSearchKey(item: CatalogItem): string {
  return [
    item.title,
    item.titleFa ?? '',
    item.imdbId,
    item.type,
    item.year != null ? String(item.year) : '',
  ]
    .join(' ')
    .toLowerCase();
}

export function indexItems(items: CatalogItem[]): IndexedCatalogItem[] {
  return items.map((item) => {
    const normalized = normalizeItem(item);
    return {
      ...normalized,
      searchKey: buildSearchKey(normalized),
    };
  });
}

/** Index in chunks; waits for idle between chunks (background sync). */
export async function indexItemsWhenIdle(
  items: CatalogItem[],
  isBusy?: () => boolean,
  chunkSize = 1000,
): Promise<IndexedCatalogItem[]> {
  const out: IndexedCatalogItem[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    await waitUntilIdle(isBusy);
    const end = Math.min(i + chunkSize, items.length);
    for (let j = i; j < end; j += 1) {
      const normalized = normalizeItem(items[j]!);
      out.push({
        ...normalized,
        searchKey: buildSearchKey(normalized),
      });
    }
    await paintTick();
  }
  return out;
}
