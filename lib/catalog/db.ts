import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { IndexedCatalogItem } from './types';

const DB_NAME = 'dmovie.catalog.db';
const SCHEMA_VERSION = '1';

let dbPromise: Promise<SQLiteDatabase> | null = null;

export async function openCatalogDb(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS items (
          imdb_id TEXT PRIMARY KEY NOT NULL,
          search_key TEXT NOT NULL,
          payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS posters (
          imdb_id TEXT PRIMARY KEY NOT NULL,
          remote_url TEXT,
          file_uri TEXT,
          updated_at INTEGER NOT NULL
        );
      `);
      await db.runAsync(
        'INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)',
        'schema_version',
        SCHEMA_VERSION,
      );
      return db;
    })();
  }
  return dbPromise;
}

export async function getItemCount(): Promise<number> {
  const db = await openCatalogDb();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM items',
  );
  return row?.count ?? 0;
}

export async function loadAllItems(): Promise<IndexedCatalogItem[]> {
  const db = await openCatalogDb();
  const rows = await db.getAllAsync<{ payload: string }>(
    'SELECT payload FROM items',
  );
  const items: IndexedCatalogItem[] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.payload) as IndexedCatalogItem;
      if (parsed?.imdbId && parsed?.searchKey) {
        items.push(parsed);
      }
    } catch {
      // Skip corrupt rows.
    }
  }
  return items;
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await openCatalogDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await openCatalogDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
    key,
    value,
  );
}

export async function replaceAllItems(
  items: IndexedCatalogItem[],
  meta?: { baseUrl?: string; archiveFingerprint?: string },
): Promise<void> {
  const db = await openCatalogDb();
  const BATCH = 80;

  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM items');

    for (let i = 0; i < items.length; i += BATCH) {
      const chunk = items.slice(i, i + BATCH);
      const placeholders = chunk.map(() => '(?, ?, ?)').join(', ');
      const values: (string | number | null)[] = [];
      for (const item of chunk) {
        values.push(item.imdbId, item.searchKey, JSON.stringify(item));
      }
      await db.runAsync(
        `INSERT INTO items (imdb_id, search_key, payload) VALUES ${placeholders}`,
        ...values,
      );
    }

    const now = String(Date.now());
    await db.runAsync(
      'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
      'item_count',
      String(items.length),
    );
    await db.runAsync(
      'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
      'updated_at',
      now,
    );
    if (meta?.baseUrl) {
      await db.runAsync(
        'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
        'base_url',
        meta.baseUrl,
      );
    }
    if (meta?.archiveFingerprint) {
      await db.runAsync(
        'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
        'archive_fingerprint',
        meta.archiveFingerprint,
      );
    }
  });
}

export type PosterRow = {
  imdbId: string;
  remoteUrl: string | null;
  fileUri: string | null;
  updatedAt: number;
};

export async function getPoster(imdbId: string): Promise<PosterRow | null> {
  const db = await openCatalogDb();
  const row = await db.getFirstAsync<{
    imdb_id: string;
    remote_url: string | null;
    file_uri: string | null;
    updated_at: number;
  }>(
    'SELECT imdb_id, remote_url, file_uri, updated_at FROM posters WHERE imdb_id = ?',
    imdbId,
  );
  if (!row) return null;
  return {
    imdbId: row.imdb_id,
    remoteUrl: row.remote_url,
    fileUri: row.file_uri,
    updatedAt: row.updated_at,
  };
}

export async function upsertPoster(
  imdbId: string,
  remoteUrl: string | null,
  fileUri: string | null,
): Promise<void> {
  const db = await openCatalogDb();
  await db.runAsync(
    `INSERT INTO posters (imdb_id, remote_url, file_uri, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(imdb_id) DO UPDATE SET
       remote_url = excluded.remote_url,
       file_uri = excluded.file_uri,
       updated_at = excluded.updated_at`,
    imdbId,
    remoteUrl,
    fileUri,
    Date.now(),
  );
}

export async function clearCatalog(): Promise<void> {
  const db = await openCatalogDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM items');
    await db.runAsync(
      'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
      'item_count',
      '0',
    );
    await db.runAsync(
      'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
      'updated_at',
      String(Date.now()),
    );
    await db.runAsync(
      'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
      'archive_fingerprint',
      '',
    );
  });
}
