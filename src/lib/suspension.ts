/**
 * An organization its operator suspended (the `suspended` of its limits row,
 * lib/limits.ts) serves nothing to the public. On every host, its portals,
 * share and upload links and BrandHub listings answer 451, pages and their
 * API alike (src/proxy.ts), and its files at /a and /c answer 451 to anyone
 * outside it. Its people keep the app, read-only.
 *
 * Relative imports only: `pnpm test` runs this under plain Node.
 */

/** What a request names that a suspension takes down: a portal, a share link, an organization on BrandHub, or the one a host serves. */
export type Suspendable = { portal: string } | { share: string } | { org: string } | { organizationId: string };

const NAME = /^[\w-]+$/;
/** app/hub's own pages, not organizations. */
const HUB_PAGES = new Set(["score", "llms.txt", "index.json", "sitemap.xml", "robots.txt"]);
/** /api/v1/hub's own routes, not organizations. */
const HUB_ROUTES = new Set(["offers", "reports"]);

/**
 * What a path names, as src/proxy.ts sees it before rewriting: /p/{slug} and
 * /api/v1/portal/{slug}, /s/{token} and /api/v1/shared/{token}, /hub/{org}
 * and /api/v1/hub/{org}, with a path on BrandHub's own host read as the /hub
 * one it is. Null for anything else.
 */
export function suspendable(pathname: string, onHub = false): Suspendable | null {
  const path = onHub && !/^\/(api|a|c)\//.test(pathname) ? `/hub${pathname}` : pathname;
  const [, a, b, c, d] = path.split("/");
  const api = a === "api" && b === "v1";
  const [kind, name] = api ? [c, d] : [a, b];
  if (!name || !NAME.test(name)) return null;
  if (kind === (api ? "portal" : "p")) return { portal: name };
  if (kind === (api ? "shared" : "s")) return { share: name };
  if (kind === "hub" && !(api ? HUB_ROUTES : HUB_PAGES).has(name)) return { org: name };
  return null;
}

/** The answer in its place: no organization named, kept by no cache, so lifting the suspension brings it back at once. */
export function unavailable(api: boolean) {
  const headers = { "Cache-Control": "no-store" };
  if (api) return Response.json({ error: { code: "suspended", message: "This content is unavailable" } }, { status: 451, headers });
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Unavailable</title></head><body><h1>Unavailable</h1><p>This content is unavailable.</p></body></html>`;
  return new Response(html, { status: 451, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}
