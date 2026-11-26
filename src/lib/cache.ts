/**
 * Tiny TTL cache with a Redis-shaped interface. In production swap the
 * implementation for ioredis (same get/set/del contract) via REDIS_URL.
 */
interface Entry<T> {
  value: T;
  expires: number;
}

const globalForCache = globalThis as typeof globalThis & { __lumiereCache?: Map<string, Entry<unknown>> };
const store = globalForCache.__lumiereCache ?? new Map<string, Entry<unknown>>();
globalForCache.__lumiereCache = store;

export const cache = {
  get<T>(key: string): T | undefined {
    const e = store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expires) {
      store.delete(key);
      return undefined;
    }
    return e.value as T;
  },
  set<T>(key: string, value: T, ttlSeconds: number) {
    store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  },
  del(key: string) {
    store.delete(key);
  },
  clearPrefix(prefix: string) {
    for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
  },
};

export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get<T>(key);
  if (hit !== undefined) return hit;
  const value = await fn();
  cache.set(key, value, ttlSeconds);
  return value;
}
