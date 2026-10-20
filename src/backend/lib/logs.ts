import {storage} from '@zaiusinc/app-sdk';

// kvStore values must be objects of primitives, so each log is kept as one
// JSON string field. Good enough for a few dozen debug entries.
interface StoredLog {
  items?: string;
  [field: string]: string | undefined;
}

export async function readLog<T>(key: string): Promise<T[]> {
  const stored = await storage.kvStore.get<StoredLog>(key);
  if (!stored.items) return [];
  try {
    return JSON.parse(stored.items) as T[];
  } catch {
    return [];
  }
}

/** Adds an entry to the front of the log and keeps at most `limit` entries. */
export async function appendLog<T>(key: string, entry: T, limit: number): Promise<void> {
  const items = await readLog<T>(key);
  items.unshift(entry);
  await storage.kvStore.put(key, {items: JSON.stringify(items.slice(0, limit))});
}

export async function clearLog(key: string): Promise<void> {
  await storage.kvStore.delete(key);
}

export const INBOX_KEY = 'webhook_inbox';
export const LIFECYCLE_KEY = 'lifecycle_log';
export const SCRATCH_KEY = 'scratch';
