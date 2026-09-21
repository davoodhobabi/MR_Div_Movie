import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  getContinueWatching,
  persistContinueWatching,
  removeContinueWatching,
  upsertContinueWatching,
  type ContinueWatchingEntry,
} from '../lib/catalog/continueWatching';
import { BUNDLED_CATALOG } from '../lib/catalog/data/loadBundled';
import {
  getFavoriteIds,
  persistFavoriteIds,
} from '../lib/catalog/favorites';
import { findByImdbId, findManyByImdbIds, searchCatalog } from '../lib/catalog/search';
import { isSeriesItem, type IndexedCatalogItem } from '../lib/catalog/types';

type CatalogContextValue = {
  count: number;
  search: (query: string) => IndexedCatalogItem[];
  findById: (imdbId: string) => IndexedCatalogItem | undefined;
  movies: IndexedCatalogItem[];
  series: IndexedCatalogItem[];
  favorites: IndexedCatalogItem[];
  continueWatching: Array<{
    item: IndexedCatalogItem;
    entry: ContinueWatchingEntry;
  }>;
  isFavorite: (imdbId: string) => boolean;
  toggleFavorite: (imdbId: string) => void;
  recordProgress: (entry: Omit<ContinueWatchingEntry, 'updatedAt'>) => void;
  dismissContinueWatching: (imdbId: string) => void;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const items = BUNDLED_CATALOG;
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [continueEntries, setContinueEntries] = useState<ContinueWatchingEntry[]>(
    [],
  );
  const itemsRef = useRef<IndexedCatalogItem[]>(BUNDLED_CATALOG);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ids, watching] = await Promise.all([
        getFavoriteIds(),
        getContinueWatching(),
      ]);
      if (cancelled) return;
      setFavoriteIds(ids);
      setContinueEntries(watching);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const search = useCallback(
    (query: string) => searchCatalog(itemsRef.current, query),
    [],
  );

  const findById = useCallback(
    (imdbId: string) => findByImdbId(itemsRef.current, imdbId),
    [],
  );

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const isFavorite = useCallback(
    (imdbId: string) => favoriteSet.has(imdbId),
    [favoriteSet],
  );

  const toggleFavorite = useCallback((imdbId: string) => {
    const id = imdbId.trim();
    if (!id) return;
    setFavoriteIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [id, ...prev];
      void persistFavoriteIds(next);
      return next;
    });
  }, []);

  const movies = useMemo(
    () => items.filter((item) => !isSeriesItem(item)),
    [items],
  );

  const series = useMemo(
    () => items.filter((item) => isSeriesItem(item)),
    [items],
  );

  const favorites = useMemo(
    () => findManyByImdbIds(items, favoriteIds),
    [items, favoriteIds],
  );

  const recordProgress = useCallback(
    (entry: Omit<ContinueWatchingEntry, 'updatedAt'>) => {
      setContinueEntries((prev) => {
        const current = prev.find((item) => item.imdbId === entry.imdbId);
        if (
          current &&
          current.uri === entry.uri &&
          Math.abs(current.position - entry.position) < 2
        ) {
          return prev;
        }
        const next = upsertContinueWatching(prev, {
          ...entry,
          updatedAt: Date.now(),
        });
        if (next === prev) return prev;
        void persistContinueWatching(next);
        return next;
      });
    },
    [],
  );

  const dismissContinueWatching = useCallback((imdbId: string) => {
    const id = imdbId.trim();
    if (!id) return;
    setContinueEntries((prev) => {
      const next = removeContinueWatching(prev, id);
      if (next === prev) return prev;
      void persistContinueWatching(next);
      return next;
    });
  }, []);

  const continueWatching = useMemo(() => {
    const resolved: Array<{
      item: IndexedCatalogItem;
      entry: ContinueWatchingEntry;
    }> = [];
    for (const entry of continueEntries) {
      const item = findByImdbId(items, entry.imdbId);
      if (item) resolved.push({ item, entry });
    }
    return resolved;
  }, [continueEntries, items]);

  const value = useMemo<CatalogContextValue>(
    () => ({
      count: items.length,
      search,
      findById,
      movies,
      series,
      favorites,
      continueWatching,
      isFavorite,
      toggleFavorite,
      recordProgress,
      dismissContinueWatching,
    }),
    [
      items,
      search,
      findById,
      movies,
      series,
      favorites,
      continueWatching,
      isFavorite,
      toggleFavorite,
      recordProgress,
      dismissContinueWatching,
    ],
  );

  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogContextValue {
  const value = useContext(CatalogContext);
  if (!value) {
    throw new Error('useCatalog must be used within CatalogProvider');
  }
  return value;
}
