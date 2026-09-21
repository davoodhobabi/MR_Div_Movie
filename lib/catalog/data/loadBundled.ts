import type { IndexedCatalogItem } from '../types';
import bundled from './bundledCatalog.json';

/**
 * Catalog baked in at build time (`npm run catalog:fetch`).
 * First launch must be instant — no network / SQLite required.
 */
export const BUNDLED_CATALOG = bundled as IndexedCatalogItem[];

export const BUNDLED_CATALOG_COUNT = BUNDLED_CATALOG.length;
