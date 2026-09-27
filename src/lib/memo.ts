/**
 * An async lookup kept per key for `ms`, so what every request asks and
 * hardly ever changes costs one database round trip a minute, not one a
 * request. A failed lookup is not kept. `forget` drops one key, or all.
 *
 * ponytail: per process. Another instance sees a change up to `ms` late;
 * the writer calls `forget` so its own instance sees it at once. A shared
 * store (or LISTEN/NOTIFY) if that ever matters.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */
export function memo<T>(ms: number, load: (key: string) => Promise<T>) {
  const kept = new Map<string, { at: number; value: Promise<T> }>();
  const get = (key = "") => {
    const hit = kept.get(key);
    if (hit && Date.now() - hit.at < ms) return hit.value;
    const value = load(key);
    kept.set(key, { at: Date.now(), value });
    value.catch(() => kept.get(key)?.value === value && kept.delete(key));
    return value;
  };
  get.forget = (key?: string) => void (key === undefined ? kept.clear() : kept.delete(key));
  return get;
}
