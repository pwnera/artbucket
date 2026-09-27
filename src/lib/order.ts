/**
 * A person's own order for a list whose items come from elsewhere: ids they
 * placed come first, in their order; anything new follows in the list's own
 * order; ids that no longer exist are ignored.
 *
 * Pure, so `pnpm test` runs it under plain Node.
 */
export function applyOrder<T>(items: T[], order: string[], id: (t: T) => string): T[] {
  const at = new Map(order.map((k, i) => [k, i]));
  const placed = items.filter((t) => at.has(id(t))).sort((a, b) => at.get(id(a))! - at.get(id(b))!);
  return [...placed, ...items.filter((t) => !at.has(id(t)))];
}

/** `ids` with `moving` taken out and put before (or after) `target`. */
export function moveTo(ids: string[], moving: string, target: string, after: boolean): string[] {
  if (moving === target) return ids;
  const rest = ids.filter((k) => k !== moving);
  const i = rest.indexOf(target);
  if (i < 0) return ids;
  rest.splice(i + (after ? 1 : 0), 0, moving);
  return rest;
}
