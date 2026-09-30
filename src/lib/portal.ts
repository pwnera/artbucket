import { z } from "zod";
import { withSignature } from "./asset-url.ts";
import { logoOf, tintOf, type HubRule } from "./hub.ts";
import { pageSlug } from "./pages.ts";

/**
 * Brand portals: a curated, themed front door onto chosen collections, for
 * people outside the team (lib/core/portals.ts). What a portal offers to
 * download, how it is themed, and the names it goes by.
 *
 * Relative imports only: `pnpm test` runs this under plain Node.
 */

/**
 * What a visitor downloads instead of the raw original: renditions made for a
 * purpose (lib/transform.ts). `original` is the file as uploaded, with its
 * metadata written in; a portal offers it only when told to.
 */
export const PORTAL_PRESETS = {
  web: { label: "Web", hint: "JPEG, 1920 px wide", spec: "w_1920,q_85,f_jpeg" },
  social: { label: "Social", hint: "JPEG, 1080 px square", spec: "w_1080,h_1080,fit_cover,f_jpeg" },
  story: { label: "Story", hint: "JPEG, 1080 × 1920", spec: "w_1080,h_1920,fit_cover,f_jpeg" },
  print: { label: "Print", hint: "JPEG, full size", spec: "w_8000,q_95,f_jpeg" },
  png: { label: "PNG", hint: "Full size, keeps transparency", spec: "f_png" },
  original: { label: "Original", hint: "The file as uploaded", spec: null },
} as const;
export type PortalPreset = keyof typeof PORTAL_PRESETS;
export const PRESET_IDS = Object.keys(PORTAL_PRESETS) as [PortalPreset, ...PortalPreset[]];
export const DEFAULT_PRESETS: PortalPreset[] = ["web", "print", "social"];

export type Download = { preset: PortalPreset; label: string; hint: string; url: string; filename: string };

/**
 * The downloads a portal offers for one asset. Images get the portal's
 * presets; anything else (a PDF, a video, a font) is only useful as itself,
 * so it gets its original whatever the presets say. `s` signs them
 * (lib/signed.ts) for a visitor without an account.
 */
export function downloadsFor(asset: { id: string; filename: string; mime: string }, presets: PortalPreset[], base: string, s?: string): Download[] {
  const at = `${base}/a/${asset.id}`;
  const url = (path: string) => (s ? withSignature(path, s) : path);
  const stem = asset.filename.replace(/\.[^.]+$/, "");
  const { label, hint } = PORTAL_PRESETS.original;
  const original: Download = { preset: "original", label, hint, url: url(`${at}?download`), filename: asset.filename };
  if (!asset.mime.startsWith("image/")) return [original];
  const out = presets.flatMap((p): Download[] => {
    const { label, hint, spec } = PORTAL_PRESETS[p];
    if (!spec) return [original];
    const ext = spec.match(/f_(\w+)/)?.[1] === "png" ? "png" : "jpg";
    return [{ preset: p, label, hint, url: url(`${at}/${spec}`), filename: `${stem}-${p}.${ext}` }];
  });
  return out.length ? out : [original];
}

/** Lowercase letters, digits and dashes: the portal's address, /p/{slug}. */
export const PORTAL_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

/**
 * Addresses kept back when portals answer at {slug}.PORTAL_DOMAIN too: names
 * a visitor would read as the service's own, or its DNS may need.
 */
export const RESERVED_SLUGS = new Set([
  "abuse", "account", "admin", "api", "app", "artbucket", "assets", "auth", "billing", "blog", "cdn", "dev", "docs",
  "email", "ftp", "help", "hostmaster", "imap", "login", "mail", "mx", "ns1", "ns2", "pop", "postmaster", "root",
  "security", "signin", "signup", "smtp", "staging", "static", "status", "support", "test", "webmaster", "www",
]);

/** Why a slug can't be a subdomain, or null when it can: reserved, or `ab--`, the shape of a look-alike (xn--, punycode). */
export function subdomainRefusal(slug: string): string | null {
  if (RESERVED_SLUGS.has(slug)) return `"${slug}" is kept for the service: pick another address`;
  if (slug.slice(2, 4) === "--") return "An address can't have dashes as its third and fourth characters";
  return null;
}

/**
 * Where a request for a portal goes instead, or null to serve it where it is:
 * `home` is the portal now (its slug, and where it answers), `at` what was
 * asked, a portal host or /p/{slug} on the app's. It goes home, but for a
 * members portal at /p/ (its members sign in there) and an old slug on the
 * app's, which only moves to the current one.
 */
export function portalRedirect(home: { url: string; slug: string; access: string }, at: { host?: string; slug: string }) {
  const to = new URL(home.url);
  const own = !to.pathname.startsWith("/p/"); // a subdomain, or a domain of its own
  if (at.host) return own && to.host === at.host ? null : own ? to.origin : to.href;
  if (own && home.access !== "members") return to.origin;
  return at.slug !== home.slug ? `/p/${home.slug}` : null;
}

/** Whether a host is `domain` or a name under it, its port aside. */
export function underDomain(host: string, domain: string | undefined) {
  const h = host.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return !!domain && (h === domain || h.endsWith(`.${domain}`));
}

/** The portal slug a host names as a subdomain of `domain` (PORTAL_DOMAIN): one label, a portal's shape, not refused. */
export function slugAtHost(host: string, domain: string | undefined) {
  if (!domain || !host.endsWith(`.${domain}`)) return null;
  const slug = host.slice(0, -domain.length - 1);
  return PORTAL_SLUG.test(slug) && !subdomainRefusal(slug) ? slug : null;
}

export const PORTAL_ACCESS = ["public", "password", "members"] as const;
export type PortalAccess = (typeof PORTAL_ACCESS)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A color is #RRGGBB");

/** How a portal looks: its logo (an asset of the library), accent and background. Null: the app's own. */
export const PortalTheme = z.object({
  logo: z.uuid().nullable().default(null).describe("An approved image asset, shown in the header"),
  accent: hex.nullable().default(null).describe("Buttons and links"),
  background: hex.nullable().default(null).describe("The page behind everything"),
});
export type PortalTheme = z.infer<typeof PortalTheme>;
/**
 * A change to it: what is left out stays, null clears. Not `PortalTheme.partial()`, which still
 * fills each default, so sending the accent alone would clear the logo and the background.
 */
export const PortalThemePatch = z.object({
  logo: z.uuid().nullable().optional().describe("An approved image asset, shown in the header"),
  accent: hex.nullable().optional().describe("Buttons and links"),
  background: hex.nullable().optional().describe("The page behind everything"),
});

/**
 * The logo and accent a portal made for a brand wears where it sets none:
 * its first brand's mark and color, as BrandHub's card draws them (hub.ts
 * logoOf, tintOf), from the release its visitors read. `rules` carry the
 * mimes of the files that may be shown; the logo is an asset id.
 */
export function brandLook(rules: (Pick<HubRule, "key" | "type" | "value" | "context"> & { assets: { id: string; mime: string }[] })[]) {
  return { logo: logoOf(rules)?.id ?? null, accent: tintOf(rules) };
}

/** What a portal wears: what it sets, else its brand's (brandLook), else null, the organization's. Setting one is how a portal white-labels. */
export const wornTheme = (own: Pick<PortalTheme, "logo" | "accent">, brand: { logo: string | null; accent: string | null } | null) => ({
  logo: own.logo ?? brand?.logo ?? null,
  accent: own.accent ?? brand?.accent ?? null,
});

/**
 * A host name as a portal or the app may be served at: lowercased, without a
 * port or a trailing dot, at least two labels. Null for anything else.
 */
export function hostname(raw: string): string | null {
  const h = raw.trim().toLowerCase().replace(/\.$/, "").replace(/:\d+$/, "");
  if (h.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)) return null;
  return h;
}

/** A brand's domain from a URL or a host name: `https://www.Acme.com/about` is acme.com. Null for what names no host. */
export function brandDomain(raw: string): string | null {
  const host = hostname(raw.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/[/?#].*$/, "").replace(/^[^@]*@/, ""));
  return host && host.replace(/^www\./, "");
}

/** Where a domain's owner proves it: a TXT record at this name holding the token. */
export const challengeName = (host: string) => `_artbucket-challenge.${host}`;

/** Where a portal's own links may go: the web, mail, or a path on the portal. Never a script. */
const href = z
  .string()
  .trim()
  .max(2000)
  .refine((h) => /^(https?:\/\/|mailto:|\/(?!\/))/i.test(h), "https://, mailto: or a /path");
const link = z.strictObject({ label: z.string().trim().min(1).max(60), href });

/** A pinned link in the portal's header: a page (of `brand`, else the first), an asset to download, or a URL. */
const QuickLink = z
  .strictObject({
    label: z.string().trim().min(1).max(40),
    brand: z.string().max(60).optional().describe("With page: a brand the portal carries; the first when left out"),
    page: pageSlug.optional(),
    asset: z.uuid().optional(),
    href: href.optional(),
  })
  .refine((q) => [q.page, q.asset, q.href].filter(Boolean).length === 1, "One of page, asset or href")
  .refine((q) => !q.brand || q.page, "brand goes with page");

/** A portal's site around the pages: its footer, quick grab, terms and whether search engines may list it (D20, portals.site). */
export const PortalSite = z.strictObject({
  footer: z
    .strictObject({
      text: z.string().max(2000).optional().describe("Markdown"),
      links: z.array(link).max(8).optional(),
      credit: z.string().max(120).optional(),
      feedback: href.optional().describe("A URL or mailto:"),
    })
    .optional(),
  quick: z.array(QuickLink).max(6).optional().describe("Quick grab: pinned links in the header"),
  terms: z.string().max(10000).optional().describe("Markdown readers accept once before their first download"),
  listed: z.boolean().optional().describe("Search engines may index it; public portals only"),
});
export type PortalSite = z.output<typeof PortalSite>;
