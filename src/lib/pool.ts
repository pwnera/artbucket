/**
 * Run `fn` over `items`, at most `limit` at a time, in order of starting.
 */
export async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * At most `capacity` of something at once: jobs (each weighs 1) or bytes.
 * `run` waits its turn, first come first served; one heavier than the whole
 * capacity goes when it has the gate to itself. `full`: `queue` are waiting
 * already, so the caller should refuse rather than add to the line.
 *
 * ponytail: per process. Several instances each have their own.
 */
export function gate(capacity: number, queue = Infinity) {
  let used = 0;
  const waiting: { weight: number; go: () => void }[] = [];
  const next = () => {
    while (waiting.length && (used === 0 || used + waiting[0].weight <= capacity)) {
      const w = waiting.shift()!;
      used += w.weight;
      w.go();
    }
  };
  return {
    get full() {
      return waiting.length >= queue;
    },
    async run<T>(weight: number, fn: () => Promise<T>): Promise<T> {
      await new Promise<void>((go) => {
        waiting.push({ weight, go });
        next();
      });
      try {
        return await fn();
      } finally {
        used -= weight;
        next();
      }
    },
  };
}
