import AsyncStorage from "@react-native-async-storage/async-storage";

// Offline cache: last-synced payloads (timetable, calendar, documents, journeys,
// rosters, notifications) so parents/teachers/drivers can view recent info with
// no connection. Cache-first with a timestamp; screens revalidate when online.

const PREFIX = "cache:";

export async function cacheSet(key: string, value: any) {
  await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value }));
}
export async function cacheGet<T = any>(key: string): Promise<{ at: number; value: T } | null> {
  const raw = await AsyncStorage.getItem(PREFIX + key);
  return raw ? JSON.parse(raw) : null;
}
export async function cacheClearAll() {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(PREFIX) || k.startsWith("queue:")));
}
