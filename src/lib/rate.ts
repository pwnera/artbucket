/**
 * A fixed-window counter per key: at most `max` hits in each `windowMs`.
 * `hit` counts one and says how many seconds to wait (0: go ahead); `wait`
 * says the same without counting, to refuse before doing the work.
 *
 * ponytail: in memory, per process. Behind several instances each counts
 * its own; put limits in the reverse proxy, or a shared store, past that.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */
export function limiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  let sweep = 0;
  const at = (key: string, now: number) => {
    let h = hits.get(key);
    if (!h || now >= h.reset) {
      h = { n: 0, reset: now + windowMs };
      hits.set(key, h);
      // Windows that are over are forgotten, so the map never outgrows who called in the last one.
      // At most once a window: a flood of new keys must not make every one of them scan the lot.
      if (hits.size > 10_000 && now >= sweep) {
        sweep = now + windowMs;
        for (const [k, v] of hits) if (now >= v.reset) hits.delete(k);
      }
    }
    return h;
  };
  const wait = (key: string, now = Date.now()) => {
    const h = at(key, now);
    return h.n >= max ? Math.max(1, Math.ceil((h.reset - now) / 1000)) : 0;
  };
  const hit = (key: string, now = Date.now()) => {
    const w = wait(key, now);
    if (!w) at(key, now).n++;
    return w;
  };
  return { hit, wait };
}
