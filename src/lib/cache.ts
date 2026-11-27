type Entry = { t: number; d: unknown }
const store = new Map<string, Entry>()

export async function cachedFetch<T>(key: string, fn: () => Promise<T>, ttl = 30000): Promise<T> {
  const hit = store.get(key)
  if (hit && Date.now() - hit.t < ttl) return hit.d as T
  const d = await fn()
  store.set(key, { t: Date.now(), d })
  return d
}

export function clearCache(prefix?: string): void {
  if (!prefix) {
    store.clear()
    return
  }
  for (const k of [...store.keys()]) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}