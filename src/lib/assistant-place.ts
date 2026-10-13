/**
 * Where the server's assistant (components/assistant.tsx) may take the person
 * when it asks ({ navigate }) or links ([[open:...]]): every page of the app
 * that shows something, an editor, or an empty form, which does nothing until
 * the person acts. Never a page that acts by being opened, a token's page, or
 * one outside the app (BrandHub, a portal as visitors see it), which would
 * close the panel. Pure, so `pnpm test` runs it under plain Node.
 */

const SLUG = "[a-z0-9][a-z0-9-]{0,63}";
const IS_SLUG = new RegExp(`^${SLUG}$`);
const IS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A brand's tabs (app/(app)/brands/[slug]/(tabs)); its overview is /brands/{slug}. */
export const BRAND_TABS = ["guidelines", "rules", "theme", "assets", "score", "insights", "releases", "portals", "sharing", "settings"];
/** An object's tabs in the catalog (components/catalog.tsx). */
export const CATALOG_TABS = ["overview", "lineage", "access", "activity"];
/** The Team page's tabs (components/team.tsx). */
export const TEAM_TABS = ["people", "sharing", "audit"];
/** The library view's keys (lib/view.ts), and the asset open over it. */
const LIBRARY = new Set(["q", "tag", "type", "status", "collection", "asset"]);

/** Whether a place reads this query key with this value; any other is dropped (an editor's ?git=, ?panel=). */
type Reads = (key: string, value: string) => boolean;
const nothing: Reads = () => false;
const library: Reads = (k) => LIBRARY.has(k) || /^f\.[a-z0-9_]+$/.test(k);
const page: Reads = (k, v) => k === "page" && IS_SLUG.test(v);
const plain = (v: string) => v.length <= 300 && !/[\u0000-\u001f\u007f]/.test(v);

const PLACES: [RegExp, Reads][] = [
  // The library and Review: the same view, with its filters and an asset open.
  [/^\/(?:review)?$/, library],
  [/^\/(?:collections|activity|connections|insights(?:\/(?:activity|checks))?)$/, nothing],
  // ?new=brand opens New brand, empty.
  [/^\/brands$/, (k, v) => k === "new" && v === "brand"],
  // A guidelines page by its slug, with the ways to edit it or its comments open; first, as guidelines is a tab too.
  // The retired builder's address (/edit) still redirects there.
  [new RegExp(`^/brands/${SLUG}/guidelines(?:/edit)?$`), (k, v) => page(k, v) || ((k === "ways" || k === "comments") && v === "1")],
  [new RegExp(`^/brands/${SLUG}(?:/(?:${BRAND_TABS.join("|")}))?$`), nothing],
  // The catalog: an object (by id or address) on one of its tabs, or a project's folder.
  [/^\/catalog$/, (k, v) => (k === "o" && plain(v)) || (k === "f" && IS_UUID.test(v)) || (k === "tab" && CATALOG_TABS.includes(v))],
  // Sites: one portal's editor or its requests, the ones showing a brand, or New portal or site, empty.
  [/^\/sites$/, (k, v) => ((k === "edit" || k === "open") && IS_UUID.test(v)) || ((k === "brand" || k === "new") && IS_SLUG.test(v))],
  // ?invite opens Invite, empty.
  [/^\/team$/, (k, v) => (k === "tab" && TEAM_TABS.includes(v)) || k === "invite"],
  // Settings and its sections (components/settings/sections.ts); one the person may not open, the page says so.
  [/^\/settings(?:\/(?:project|organization|account)\/[a-z][a-z-]{0,40})?$/, nothing],
];

/** The path the assistant asked for, when it is one of those places on this origin, with only the query it reads; null otherwise. */
export function assistantPlace(path: unknown, origin: string): string | null {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.length > 2000) return null;
  let u: URL;
  try {
    u = new URL(path, origin);
  } catch {
    return null;
  }
  if (u.origin !== origin) return null;
  const reads = PLACES.find(([re]) => re.test(u.pathname))?.[1];
  if (!reads) return null;
  const q = new URLSearchParams([...u.searchParams].filter(([k, v]) => reads(k, v)));
  return q.size ? `${u.pathname}?${q}` : u.pathname;
}
