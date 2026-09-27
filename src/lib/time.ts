/**
 * Times as people read them: "3 hours ago" in a list, the exact moment on
 * hover, and "Today" / "Yesterday" / the date as a group heading.
 *
 * Pure, so `pnpm test` runs it under plain Node.
 */
export const ago = (at: string | Date, now = Date.now()) => {
  const s = (new Date(at).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, n] of [["year", 31_536_000], ["month", 2_592_000], ["day", 86_400], ["hour", 3_600], ["minute", 60]] as const) {
    if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), unit);
  }
  return "just now";
};

export const exact = (at: string | Date) =>
  new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** "Today", "Yesterday", or the date: how a history groups what happened. */
export function day(at: string | Date, now = new Date()) {
  const d = new Date(at);
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/** "now", "5m", "3h", "2d", "3w", "4mo", "1y": an age that fits beside a sidebar item. */
export function short(at: string | Date | number, now = Date.now()) {
  const s = Math.max(0, (now - new Date(at).getTime()) / 1000);
  for (const [unit, n] of [["y", 31_536_000], ["mo", 2_592_000], ["w", 604_800], ["d", 86_400], ["h", 3_600], ["m", 60]] as const) {
    if (s >= n) return `${Math.floor(s / n)}${unit}`;
  }
  return "now";
}
