/**
 * Where the server's assistant (components/assistant.tsx) may take the person
 * when it asks ({ navigate }): pages that show things, never one that acts by
 * being opened. Pure, so `pnpm test` runs it under plain Node.
 */

/** Where the assistant may take the person: the library's views, an asset, a brand's tabs and guidelines, and the app's own pages. */
const PLACES = /^\/(?:|review|collections|brands|activity|insights|sites|team|brands\/[a-z0-9][a-z0-9-]{0,63}(?:\/(?:guidelines|rules|theme|assets|score|insights|releases|portals|sharing|settings))?)$/;

/** The path the assistant asked for, when it is one of those places on this origin; null otherwise. */
export function assistantPlace(path: unknown, origin: string): string | null {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.length > 2000) return null;
  let u: URL;
  try {
    u = new URL(path, origin);
  } catch {
    return null;
  }
  if (u.origin !== origin || !PLACES.test(u.pathname)) return null;
  // Only the query a place reads to show something: the library's view (lib/view.ts), a guidelines page. The rest
  // (an editor's ?git=, ?panel=) is dropped.
  const keeps = u.pathname === "/" ? (k: string) => LIBRARY.has(k) || /^f\.[a-z0-9_]+$/.test(k) : u.pathname.endsWith("/guidelines") ? (k: string) => k === "page" : () => false;
  const q = new URLSearchParams([...u.searchParams].filter(([k]) => keeps(k)));
  return q.size ? `${u.pathname}?${q}` : u.pathname;
}

/** The library view's keys (lib/view.ts), and the asset open over it. */
const LIBRARY = new Set(["q", "tag", "type", "status", "collection", "asset"]);
