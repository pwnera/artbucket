/**
 * Sites (PRD part 2): one object with an address, access and deployments.
 * A `portal` is managed: Artbucket renders it from the brand (lib/portal.ts,
 * the `portals` table it lives in). The other kinds are builds: static files
 * made anywhere, uploaded as deployments, mounted at a path of the site.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export const SITE_KINDS = ["portal", "guidelines", "landing", "docs", "storybook"] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

/** The kinds that are static files someone built: every kind but the managed portal. */
export const BUILD_KINDS = SITE_KINDS.filter((k): k is Exclude<SiteKind, "portal"> => k !== "portal");
export type BuildKind = (typeof BUILD_KINDS)[number];

export const SITE_KIND_LABEL: Record<SiteKind, string> = {
  portal: "Brand portal",
  guidelines: "Guidelines",
  landing: "Landing",
  docs: "Docs",
  storybook: "Storybook",
};

export const DEPLOYMENT_STATES = ["checking", "live", "failed", "replaced"] as const;
export type DeploymentState = (typeof DEPLOYMENT_STATES)[number];

/**
 * A mount path: `/`, or `/` and lowercase segments (`/docs`, `/storybook/v2`),
 * no trailing slash. Null when it isn't one.
 */
export function mountPath(raw: string): string | null {
  const p = raw.trim().replace(/\/+$/, "") || "/";
  return p === "/" || /^(\/[a-z0-9][a-z0-9-]{0,62}){1,4}$/.test(p) ? p : null;
}

/** A deployment's limits: files in the zip, and bytes once unpacked. */
export const MAX_SITE_FILES = 5000;
export const MAX_SITE_BYTES = 200 * 1024 * 1024;

/** What a build says it read (PRD part 2, the kit's manifest): checked before it goes live, and its lineage. */
export const MANIFEST = "artbucket.site.json";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json",
  map: "application/json",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  xml: "application/xml",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  wasm: "application/wasm",
};

/** A file's content type by its extension; unknown ones download rather than run. */
export const contentTypeOf = (name: string) => TYPES[/\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? ""] ?? "application/octet-stream";

/**
 * A zip's files as the site serves them: folders skipped, hidden files and
 * macOS leftovers dropped, and the one folder a zip of `dist/` wraps
 * everything in taken off, so index.html sits at the root. Null when a name
 * would leave the site (`..`, an absolute path).
 */
export function siteFiles(names: string[]): Map<string, string> | null {
  if (names.some((n) => n.startsWith("/") || n.includes("\\") || n.split("/").includes(".."))) return null;
  const files = names.filter((n) => !n.endsWith("/") && !n.split("/").some((part) => part.startsWith(".") || part === "__MACOSX"));
  const tops = new Set(files.map((n) => (n.includes("/") ? n.split("/")[0] : "")));
  const wrapped = tops.size === 1 && !tops.has("") ? `${[...tops][0]}/` : "";
  return new Map(files.map((n) => [n.slice(wrapped.length), n]));
}

/**
 * The file a request path asks for in a deployment: the path itself, else
 * its index.html (a folder, or a pretty URL without an extension), else the
 * site's 404.html. In order, the first one that exists wins.
 */
export function candidates(rest: string): string[] {
  const p = rest.replace(/^\/+/, "");
  if (!p || p.endsWith("/")) return [`${p}index.html`, "404.html"];
  return /\.[a-z0-9]+$/i.test(p) ? [p, "404.html"] : [p, `${p}.html`, `${p}/index.html`, "404.html"];
}
