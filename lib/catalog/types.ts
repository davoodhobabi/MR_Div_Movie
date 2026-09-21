export const CATALOG_EDITIONS = ['SoftSub', 'Dubbed', 'NoSub'] as const;

export type CatalogEdition = (typeof CATALOG_EDITIONS)[number];

export type CatalogSource = {
  title: string;
  url: string;
  size: string;
  edition: CatalogEdition;
};

export type SeriesQualityOption = {
  edition: CatalogEdition;
  quality: string;
  folderUrl: string;
  episodeCount?: number;
  avgSizeLabel?: string;
};

export type SeriesSeason = {
  season: number;
  options: SeriesQualityOption[];
};

export type FolderEpisode = {
  name: string;
  url: string;
  size?: string;
};

export type CatalogItem = {
  index: number;
  title: string;
  titleFa?: string;
  year?: number;
  imdbId: string;
  type: string;
  imdbVotes: number | null;
  imdbRating: number | null;
  urls: CatalogSource[];
  seasons?: SeriesSeason[];
};

export type IndexedCatalogItem = CatalogItem & {
  searchKey: string;
};

export function isSeriesItem(item: CatalogItem): boolean {
  return item.type === 'series' || (item.seasons?.length ?? 0) > 0;
}
