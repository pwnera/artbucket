/**
 * Sites (PRD part 2): one object with an address, access and deployments.
 * A `portal` is managed: Artbucket renders it from the brand (lib/portal.ts,
 * the `portals` table it lives in). The other kinds are builds: static files
 * made anywhere, uploaded as deployments, mounted at a path of the site.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export const SITE_KINDS = ["portal", "guidelines", "landing", "docs", "storybook", "external"] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

/** The kinds that are static files someone built: every kind but the managed portal and an external site, which serves nothing here. */
export const BUILD_KINDS = SITE_KINDS.filter((k): k is Exclude<SiteKind, "portal" | "external"> => k !== "portal" && k !== "external");
export type BuildKind = (typeof BUILD_KINDS)[number];
/**
 * A deployment's kind: a build's, or `external`, what an app hosted
 * elsewhere was found to use (`artbucket site scan` from its CI): no files,
 * only its lineage, re-checked like a build's.
 */
export type DeploymentKind = BuildKind | "external";

export const SITE_KIND_LABEL: Record<SiteKind, string> = {
  portal: "Brand portal",
  guidelines: "Guidelines",
  landing: "Landing",
  docs: "Docs",
  storybook: "Storybook",
  external: "Hosted elsewhere",
};

/**
 * `held`: it looks like phishing or malware and waits for the operator (lib/site-safety.ts), its files kept but not
 * served. `preview`: a pull request's build, served at its own address beside the live one (previewHost), never live.
 */
export const DEPLOYMENT_STATES = ["checking", "live", "failed", "replaced", "held", "preview"] as const;
export type DeploymentState = (typeof DEPLOYMENT_STATES)[number];

/**
 * A mount path: `/`, or `/` and lowercase segments (`/docs`, `/storybook/v2`),
 * no trailing slash. Null when it isn't one.
 */
export function mountPath(raw: string): string | null {
  const p = raw.trim().replace(/\/+$/, "") || "/";
  return p === "/" || /^(\/[a-z0-9][a-z0-9-]{0,62}){1,4}$/.test(p) ? p : null;
}

/**
 * What a build uses from the library, kept on its deployment (lib/core/sites.ts):
 * its lineage, and what the daily re-check weighs again.
 *
 * - `copy`: a file of the build is the asset's own bytes, so it shows that
 *   version for as long as the build is live
 * - `link`: `/a/{id}`, pinned to that version
 * - `current`: `/c/{id}`, which follows the stack; `asset` is the version
 *   current when it deployed
 * - `declared`: named by the build's artbucket.site.json
 */
export type SiteUse = { asset: string; how: "copy" | "link" | "current" | "declared"; file: string | null };

const READS = /\.(html?|css|m?[jt]sx?|cjs|json|svg|xml|mdx?|txt|vue|svelte|astro|scss|less)$/i;
/** Files read for the library's addresses: text a browser runs or shows, or the source an external site is built from (artbucket site scan), up to 2 MB (a larger bundle is left out). */
export const readsLinks = (name: string, size: number) => READS.test(name) && size <= 2_000_000;

const ADDRESS = /\/([ac])\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-z-])/gi;

/**
 * The library's addresses a text names, on any host or none: `/a/{id}` pins
 * a version, `/c/{id}` follows the current one. Ids only; whether they are
 * this project's assets is the database's to say.
 */
export function assetAddresses(text: string): { pinned: string[]; current: string[] } {
  const pinned = new Set<string>();
  const current = new Set<string>();
  for (const m of text.matchAll(ADDRESS)) (m[1].toLowerCase() === "a" ? pinned : current).add(m[2].toLowerCase());
  return { pinned: [...pinned], current: [...current] };
}

/** A deployment's limits: files in the zip, and bytes once unpacked. */
export const MAX_SITE_FILES = 5000;
export const MAX_SITE_BYTES = 200 * 1024 * 1024;

/** What a build says it read (PRD part 2, the kit's manifest): checked before it goes live, and its lineage. */
export const MANIFEST = "artbucket.site.json";

/** What `storybook build` writes beside index.html: every story and docs page, by id. */
export const STORYBOOK_INDEX = "index.json";

/**
 * A component a Storybook documents, as its index.json says: one catalog part
 * of its site, versioned by lib/core/sites.ts as its code or stories change.
 * `files`: its stories' and component's source, relative to where Storybook
 * ran, which the CLI hashes into the manifest's `fingerprints`. `tags`: the
 * team's own Storybook tags on its stories, which search reads like an asset's.
 */
export type SiteComponent = { slug: string; name: string; title: string; story: string; stories: string[]; files: string[]; tags: string[] };

/** A story, as Storybook shows it alone (`iframe.html`, framed from `framed`), and in its own UI, at the site's own address. */
export const storyAt = (framed: string | null, home: string | null, path: string, story: string) => {
  const at = (base: string | null) => base && `${base}${path === "/" ? "" : path}`;
  const id = encodeURIComponent(story);
  return { preview: framed && `${at(framed)}/iframe.html?id=${id}&viewMode=story`, storybook: (home ?? framed) && `${at(home ?? framed)}/?path=/story/${id}` };
};

/** Tags Storybook sets or reads itself: about where a story shows, not what it is. */
const STORYBOOK_TAGS = new Set(["dev", "test", "autodocs", "manifest", "play-fn", "vitest", "attached-mdx", "unattached-mdx", "stories-mdx", "docs-only"]);

const MAX_COMPONENTS = 2000;

/**
 * A Storybook's components, from its index.json (v4 `stories` or v5
 * `entries`): one per title ("UI/Button"), named by its last segment,
 * addressed by Storybook's own id for it (`ui-button`), with its stories in
 * order. Docs-only entries count only when the title has no story. Anything
 * that isn't one is none.
 */
export function storybookComponents(index: unknown): SiteComponent[] {
  const i = index as { entries?: unknown; stories?: unknown } | null;
  const entries = i && typeof i === "object" ? (i.entries ?? i.stories) : null;
  if (!entries || typeof entries !== "object") return [];
  const byTitle = new Map<string, SiteComponent>();
  for (const e of Object.values(entries as Record<string, unknown>)) {
    const { id, title, name, type } = (e ?? {}) as Record<string, unknown>;
    if (typeof id !== "string" || typeof title !== "string" || !id.includes("--")) continue;
    let c = byTitle.get(title);
    if (!c) {
      if (byTitle.size >= MAX_COMPONENTS) continue;
      c = { slug: id.split("--")[0], name: title.split("/").pop()!.trim(), title, story: id, stories: [], files: [], tags: [] };
      byTitle.set(title, c);
    }
    const { importPath, componentPath, tags } = (e ?? {}) as Record<string, unknown>;
    for (const f of [importPath, componentPath]) if (typeof f === "string" && !c.files.includes(f)) c.files.push(f);
    for (const t of Array.isArray(tags) ? tags : []) {
      const tag = typeof t === "string" ? t.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 64) : "";
      if (tag && !tag.startsWith("!") && !STORYBOOK_TAGS.has(tag) && !c.tags.includes(tag) && c.tags.length < 20) c.tags.push(tag);
    }
    if (type === "docs") continue;
    if (!c.stories.length) c.story = id;
    if (typeof name === "string") c.stories.push(name);
  }
  return [...byTitle.values()];
}

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

/**
 * Whether a request to a site's own address is for its build's files rather
 * than Artbucket's pages: every path of a site that is all build, else a
 * path under one of its mounts (never /, which a brand portal keeps).
 */
/**
 * Whether a build asked at its BUILD_DOMAIN address, when its site has a
 * domain of its own, answers there anyway rather than sending the visitor on:
 * only a public site's, framed (the app's Components page shows a
 * Storybook's stories from there, and can't know to frame a customer's
 * domain), and what that framed page loads from the same address (its
 * scripts, styles, fonts: never a page of its own, which a visit is). A visit
 * is sent on before anything of it loads here. Sec-Fetch-Dest and
 * Sec-Fetch-Site are the browser's to send, never a page's.
 */
export const answersFramed = (access: string, dest: string | null, site: string | null) =>
  access === "public" && (dest === "iframe" || (site === "same-origin" && !!dest && dest !== "document"));
/** Set by src/proxy.ts on a build it answers framed: the answer is never cached, so a visit there is still sent to the site's own domain. */
export const FRAMED_HEADER = "x-artbucket-framed";

export const servesBuild = (site: { kind: string; mounts: string[] }, rest: string) =>
  site.kind !== "portal" || site.mounts.some((m) => m !== "/" && (rest === m || rest.startsWith(`${m}/`)));

/**
 * The name of a password site's door cookie (lib/core/sites.ts). Over HTTPS
 * it carries the `__Host-` prefix: the browser takes it only from the site's
 * own host, never with a Domain, so another site under PORTAL_DOMAIN, whose
 * scripts run on a sibling host of the same domain, can neither set it nor
 * shadow it. Plain HTTP, in development, can't carry the prefix.
 */
export const unlockCookie = (secure: boolean) => (secure ? "__Host-ab_site" : "ab_site");

/**
 * Where a members site's host trades the app's ticket for its door's cookie
 * (lib/core/sites.ts letIn): answered on every site's host, whatever its
 * builds hold there.
 */
export const ENTER_PATH = "/.artbucket/enter";

/** A preview's name: what a CI gives it, such as pr-12. Lowercase letters, digits and single dashes, 30 at most. */
export const PREVIEW_NAME = /^[a-z0-9](?:[a-z0-9]|-(?!-)){0,28}[a-z0-9]$|^[a-z0-9]$/;

/**
 * The one DNS label a site's preview answers at under PORTAL_DOMAIN: `pr-12--acme-docs`, the preview's name, two
 * dashes, the site's address. Null when it can't be one label (63 characters at most).
 */
export const previewLabel = (slug: string, name: string) => (name.length + 2 + slug.length <= 63 ? `${name}--${slug}` : null);
