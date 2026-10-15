/**
 * How a request to a site's build is answered from its stored files (PRD
 * part 2, "Serving"): which live deployment's mount holds the path, the file
 * it names, the build's _redirects and _headers, its 404.html, and the
 * headers every answer carries. The core serves builds with it
 * (lib/core/sites.ts siteFile, app/sitefiles), and so can an edge in front
 * that reads the same storage (GET /api/v1/sites/edge): one answer either way.
 *
 * Pure: `pnpm test` runs it under plain Node, and it imports nothing but its
 * neighbours, so a Worker can bundle it.
 */
import { candidates, contentTypeOf, MANIFEST } from "./sites.ts";
import { headersFor, HEADERS, redirectFor, REDIRECTS, type SiteRules } from "./site-rules.ts";

/** A live deployment, as serving reads it: where it is mounted, where its files are stored, its rules. */
export type Mount = { path: string; prefix: string; rules: SiteRules | null };

/** What a request to a site's build gets: a folder's slash, a redirect, or a stored file with its status and the build's headers. */
export type SiteAnswer =
  | { slash: true }
  | { redirect: string; status: number; headers: [string, string][] }
  | { key: string; contentType: string; status: number; open: boolean; headers: [string, string][] };

export const underMount = (rest: string, mount: string) => mount === "/" || rest === mount || rest.startsWith(`${mount}/`);

/** The mount that holds a path: the longest that does, or none. */
export const mountFor = (mounts: Mount[], rest: string) => [...mounts].sort((a, b) => b.path.length - a.path.length).find((m) => underMount(rest, m.path)) ?? null;

/** A build's own files that are read, never served. */
const HIDDEN = new Set([MANIFEST, REDIRECTS, HEADERS]);

/**
 * The stored file a path asks for in a site's live builds, or null when none
 * holds it: a folder's slash, a redirect of the build's _redirects, or a file
 * with its status and the build's _headers. A file the path names wins over a
 * redirect unless it is forced (!); a miss answers the build's 404.html.
 * `exists(key)` says whether storage holds a key; `open`, whether anyone may
 * read the site (its answers may then be kept by caches).
 */
export async function resolveSitePath(mounts: Mount[], rest: string, open: boolean, exists: (key: string) => Promise<boolean>): Promise<SiteAnswer | null> {
  const mount = mountFor(mounts, rest);
  if (!mount) return null;
  const inner = mount.path === "/" ? rest || "/" : rest.slice(mount.path.length);
  // A folder asked without its slash gets one, as static hosts do: its page's relative links resolve under it.
  if (!inner) return { slash: true as const };
  const headers = headersFor(mount.rules?.headers ?? [], inner);
  // The file a path names, else none: what a redirect that isn't forced gives way to. Its rules files are never served.
  // A rewrite serves the file it names as it is: no slash added for a folder's index.
  const fileAt = async (path: string, rewrite = false): Promise<{ slash: true } | { key: string; contentType: string } | null> => {
    for (const name of candidates(path)) {
      if (name === "404.html" || HIDDEN.has(name)) continue;
      if (!(await exists(mount.prefix + name))) continue;
      if (!rewrite && name.endsWith("index.html") && !path.endsWith("/")) return { slash: true as const };
      return { key: mount.prefix + name, contentType: contentTypeOf(name) };
    }
    return null;
  };
  const notFound = async (): Promise<SiteAnswer | null> => {
    const key = mount.prefix + "404.html";
    return (await exists(key)) ? { key, contentType: contentTypeOf("404.html"), status: 404, open, headers } : null;
  };
  const rule = redirectFor(mount.rules?.redirects ?? [], inner);
  const found = rule?.force ? null : await fileAt(inner);
  if (found) return "slash" in found ? found : { ...found, status: 200, open, headers };
  if (!rule) return notFound();
  if (rule.status === 200 || rule.status === 404) {
    // Served from the build itself: a single-page app's index for every path, or a page of its own for a miss.
    const target = await fileAt(rule.to, true);
    if (!target || "slash" in target) return notFound();
    return { ...target, status: rule.status, open, headers };
  }
  // A path of the build is under its mount; a URL goes where it says.
  const to = rule.to.startsWith("/") ? `${mount.path === "/" ? "" : mount.path}${rule.to}` : rule.to;
  return { redirect: to, status: rule.status, headers };
}

/**
 * The headers a build's answer carries: the server's own, then its _headers
 * (lib/site-rules.ts), added beside them. Its own Content-Security-Policy is
 * sent beside the server's frame-ancestors, so both hold. A site behind a
 * door is never made cacheable by its rules; a preview is never indexed.
 * `framedBy`: the app's origin, which may frame a build (a Storybook's
 * stories on its Components page); nothing else may, and a build never
 * frames the app.
 */
export function siteHeaders(rules: [string, string][], open: boolean, preview: string | null = null, framedBy: string | null = null) {
  const headers = new Headers({
    "Cache-Control": open ? "public, max-age=60" : "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": `frame-ancestors 'self'${framedBy ? ` ${framedBy}` : ""}`,
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  // A preview is for its reviewers, not for search engines, whatever its build says.
  if (preview) headers.set("X-Robots-Tag", "noindex");
  for (const [name, value] of rules) {
    const lower = name.toLowerCase();
    if (lower === "cache-control") {
      if (open) headers.set(name, value);
    } else if (lower === "content-security-policy") headers.append(name, value);
    else if (lower === "x-content-type-options" || (preview && lower === "x-robots-tag")) continue;
    else headers.set(name, value);
  }
  return headers;
}
