import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'dmovie.supportReminder.v3';
const INTERVAL_MS = 5 * 60 * 60 * 1000;

export async function shouldShowSupportReminder(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const last = raw ? Number(raw) : 0;
    if (!Number.isFinite(last) || last <= 0) return true;
    return Date.now() - last >= INTERVAL_MS;
  } catch {
    return true;
  }
}

export async function markSupportReminderSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Ignore persistence failures; reminder may show again sooner.
  }
}
