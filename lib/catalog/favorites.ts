import AsyncStorage from '@react-native-async-storage/async-storage';

const FAVORITES_KEY = 'dmovie.favorites.v1';

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const value of parsed) {
      if (typeof value !== 'string') continue;
      const id = value.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    return ids;
  } catch {
    return [];
  }
}

export async function getFavoriteIds(): Promise<string[]> {
  try {
    return parseIds(await AsyncStorage.getItem(FAVORITES_KEY));
  } catch {
    return [];
  }
}

export async function persistFavoriteIds(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // Ignore persistence failures; caller still has the in-memory value.
  }
}
