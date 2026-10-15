import { delay, http, HttpResponse } from "msw";
import type { Portal } from "@/components/portals";
import type { Deployment } from "@/components/site-deployments";
import type { SharedBody } from "@/components/shared-view";
import type { SiteBody } from "@/components/portal-view";
import type { AssetsView } from "@/components/portal-assets";
import { deriveTheme } from "@/lib/brand-theme";
import { DEFAULT_BRAND } from "@/lib/branding";
import { bookView, PORTAL } from "@/components/site/story-site";
import { byId, publicItem, publicItems } from "./library";

/**
 * What the Sites stories draw (App/Features/Sites/*): Acme's portals and built sites in every state the list badges,
 * their deployments, access requests and domains, and what a visitor gets at a portal or a share link. Fixed dates
 * (October 2026) and made-up names only. `sitesApi()` answers the reads the Sites page and its dialogs make.
 */

const NOW = Date.parse("2026-10-15T10:00:00Z");
const at = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

/** The server's PORTAL_DOMAIN in stories: a portal answers at {slug}.artbucket.test. */
export const PORTAL_DOMAIN = "artbucket.test";

/** A public portal on the Acme brand and the Press collection: what each fixture changes. */
export const portal = (over: Partial<Portal> & Pick<Portal, "id" | "slug" | "name">): Portal => ({
  kind: "portal",
  intro: null,
  access: "public",
  password: false,
  expiresAt: null,
  expired: false,
  presets: ["web", "print", "social"],
  theme: { logo: null, accent: "#2f62ff", background: null },
  collections: [{ id: "col_press", name: "Press" }],
  brands: [{ slug: "acme", name: "Acme", publishedAt: at(2) }],
  site: {},
  rebuild: null,
  domain: null,
  url: `https://${over.slug}.${PORTAL_DOMAIN}`,
  pending: 0,
  createdBy: "Dana Reyes",
  ...over,
});

const TXT = (host: string) => ({ type: "TXT" as const, name: `_artbucket-challenge.${host}`, value: "artbucket-verify=7f3c9a1e" });

/** On brand.acme.test, verified. */
export const verified = portal({
  id: "sit_press",
  slug: "press",
  name: "Acme press kit",
  intro: "Logos, product shots and executive portraits for press.",
  collections: [
    { id: "col_press", name: "Press" },
    { id: "col_logos", name: "Logos" },
  ],
  domain: { host: "brand.acme.test", verified: true, record: TXT("brand.acme.test"), cname: null },
  url: "https://brand.acme.test",
});

/** Behind a password, with two people asking in. */
export const partners = portal({
  id: "sit_partners",
  slug: "partners",
  name: "Partner hub",
  access: "password",
  password: true,
  theme: { logo: null, accent: null, background: "#0b1020" },
  pending: 2,
  site: { terms: "For partner use about Acme only." },
});

/** For the team only, carrying a brand never released. */
export const team = portal({
  id: "sit_team",
  slug: "team",
  name: "Team guidelines",
  access: "members",
  collections: [],
  brands: [
    { slug: "acme", name: "Acme", publishedAt: at(2) },
    { slug: "northwind", name: "Northwind", publishedAt: null },
  ],
  url: `https://app.${PORTAL_DOMAIN}/p/team`,
});

/** Its own domain added, its DNS records not seen yet. */
export const pendingDomain = portal({
  id: "sit_retail",
  slug: "retail",
  name: "Retail partners",
  domain: {
    host: "retail.acme.test",
    verified: false,
    record: TXT("retail.acme.test"),
    cname: { type: "CNAME", name: "retail.acme.test", value: `domains.${PORTAL_DOMAIN}` },
  },
});

/** Taken offline on its closing date. */
export const offline = portal({ id: "sit_launch", slug: "spring-launch", name: "Spring launch 2026", expiresAt: at(5), expired: true });

/** A built docs site, deployed as a zip, rebuilt on each Acme release. */
export const docs = portal({
  id: "sit_docs",
  kind: "docs",
  slug: "docs",
  name: "Acme docs",
  collections: [],
  brands: [],
  theme: { logo: null, accent: null, background: null },
  rebuild: { brand: "acme", host: "api.vercel.com", lastAt: at(2), lastStatus: "200" },
  url: `https://docs.artbucket.site`,
});

/** Hosted elsewhere: its CI records what it uses. */
export const external = portal({ id: "sit_shop", kind: "external", slug: "shop", name: "Acme shop", collections: [], brands: [], theme: { logo: null, accent: null, background: null }, url: "https://shop.acme.test" });

/** The Sites page's list, alphabetical as the API sends it. */
export const portals: Portal[] = [docs, verified, external, partners, pendingDomain, offline, team].sort((a, b) => a.name.localeCompare(b.name));

/** GET /api/v1/sites/domains: the organization's verified domains, one already on a portal. */
export const hosts = [
  { host: "brand.acme.test", portal: "press" },
  { host: "media.acme.test", portal: null },
];

/** GET /api/v1/sites/{id}/requests: someone asking in, one let in, one turned away, and a question from a page. */
export const requests = [
  { id: "req_lena", email: "lena@northwind.test", name: "Lena Park", note: "Writing about the spring launch for Northwind Weekly.", status: "pending", expiresAt: null, createdAt: at(0.2), url: null, kind: "access", page: null, section: null },
  { id: "req_omar", email: "omar@studio.test", name: null, note: null, status: "approved", expiresAt: at(-80), createdAt: at(10), url: "https://partners.artbucket.test/?key=k_omar", kind: "access", page: null, section: null },
  { id: "req_sam", email: "sam@example.test", name: "Sam Okafor", note: null, status: "denied", expiresAt: null, createdAt: at(12), url: null, kind: "access", page: null, section: null },
  { id: "req_ivy", email: "ivy@studio.test", name: "Ivy Chen", note: "May we use the logo on a dark poster?", status: "pending", expiresAt: null, createdAt: at(1), url: null, kind: "question", page: "logo", section: "clear-space" },
];

const deployment = (over: Partial<Deployment> & Pick<Deployment, "id" | "state">): Deployment => ({
  path: "/",
  kind: "docs",
  preview: null,
  url: null,
  files: 214,
  bytes: 8_400_000,
  error: null,
  uses: [{ asset: "ast_logo" }, { asset: "ast_hero" }],
  componentUses: [],
  problems: [],
  flags: [],
  createdBy: "Dana Reyes",
  createdAt: at(1),
  ...over,
});

/** GET /api/v1/sites/{id}/deployments, newest first: building, a pull request's preview, live, failed, held, replaced. */
export const deployments: Deployment[] = [
  deployment({ id: "dep_6", state: "checking", createdAt: at(0.01), createdBy: "GitHub" }),
  deployment({ id: "dep_5", state: "preview", preview: "pr-12", url: "https://pr-12--docs.artbucket.site", createdAt: at(0.2), createdBy: "GitHub" }),
  deployment({ id: "dep_4", state: "live", createdAt: at(1), flags: ["Uses the 2019 logo, replaced since: /c/ast_old_logo"], componentUses: ["button", "card"] }),
  deployment({ id: "dep_3", state: "failed", error: "No index.html at the zip's root", files: 0, bytes: 0, uses: [], createdAt: at(2) }),
  deployment({ id: "dep_2", state: "held", error: "Held for review: it links a script from another host", createdAt: at(3) }),
  deployment({ id: "dep_1", state: "replaced", createdAt: at(9), createdBy: "Omar Haddad" }),
];

/** The reads of the Sites page and its dialogs, answered from the fixtures; a story adds its own on top for a state. */
export const sitesApi = () => [
  http.get("/api/v1/sites/look", () => HttpResponse.json({ data: { logo: "ast_logo", accent: "#2f62ff" } })),
  http.get("/api/v1/sites/domains", () => HttpResponse.json({ data: hosts })),
  http.get("/api/v1/sites/address", async ({ request }) => {
    const slug = new URL(request.url).searchParams.get("slug") ?? "";
    await delay(100);
    const reason = ["www", "admin"].includes(slug)
      ? `"${slug}" is kept for the service: pick another address`
      : portals.some((p) => p.slug === slug)
        ? `${slug} is taken: pick another address`
        : null;
    return HttpResponse.json({ data: { slug, available: !reason, reason, url: `https://${slug}.${PORTAL_DOMAIN}` } });
  }),
  http.get("/api/v1/brands/:slug/updates", ({ params }) =>
    HttpResponse.json({ data: params.slug === "acme" ? [{ version: 12, publishedAt: at(2) }] : [] }),
  ),
  http.get("/api/v1/brands", () => HttpResponse.json({ data: [{ slug: "acme", name: "Acme", default: true }, { slug: "northwind", name: "Northwind", default: false }] })),
  http.get("/api/v1/sites/:id/requests", () => HttpResponse.json({ data: requests })),
  http.get("/api/v1/sites/:id/deployments", () => HttpResponse.json({ data: deployments })),
];

// ---- what a visitor gets ----------------------------------------------------------------------

/** The Acme brand as a share wears it: the organization's own name and accent. */
export const acmeBrand = { ...DEFAULT_BRAND, name: "Acme", accent: "#2f62ff", custom: true };

/** No brand site: the accent over the app's own look (lib/core/page-view.ts viewLook). */
export const plainLook = {
  brand: null,
  theme: { ...deriveTheme([{ key: "color.accent", type: "color", value: "#2f62ff", context: null, assets: [], spec: null }]), settings: {} },
  signed: {},
};

const shareItem = (id: string) => {
  const p = publicItem(byId(id));
  return {
    id: p.id,
    filename: p.filename,
    title: p.title,
    description: p.description,
    creator: p.creator,
    copyright: p.copyright,
    mime: p.mime,
    size: p.size,
    width: p.width,
    height: p.height,
    url: `/a/${id}?s=sig`,
    download: `/a/${id}?download&s=sig`,
    downloadable: id !== "ast_font",
    thumbnail: p.thumbnail,
  };
};

/** GET /api/v1/shared/{token}: a collection shared for a month, or `over` for an asset, an upload link or a page. */
export const shared = (over: Partial<NonNullable<SharedBody["share"]>> = {}, data = ["ast_hero", "ast_logo", "ast_mark", "ast_reel", "ast_guide", "ast_font"], total = data.length): SharedBody => ({
  share: {
    kind: "view",
    name: "Press kit for Northwind",
    project: "Acme",
    organization: "Acme Inc",
    target: { type: "collection", label: "Press" },
    expiresAt: "2026-11-15T22:59:59.000Z",
    brand: acmeBrand,
    look: plainLook,
    ...over,
  },
  data: data.map(shareItem),
  total,
});

/** A refusal as the API says it: `password` (with whose door it is), `gone`, `not_found`, `rate_limited`. */
export const refused = (code: string, message?: string, detail?: object) => ({ error: { code, message, ...(detail && { detail }) } });

/** GET /api/v1/portal/{slug}/site for the Acme press portal: Blender's book, standing in for a released brand. */
export const siteBody = (page = "logo", over: Partial<NonNullable<SiteBody["data"]>["portal"]> = {}): SiteBody => ({
  data: {
    portal: { ...PORTAL, slug: "press", name: "Acme press kit", theme: { logo: null, accent: "#2f62ff", background: null }, assets: true, ...over },
    canonical: page === "overview" ? "/" : `/${page}`,
    redirect: false,
    view: bookView("blender", page),
  },
});

/** GET /api/v1/portal/{slug}: the Assets view of a portal with no brand, its downloads as its presets name them. */
export const assetsBody = (over: Partial<AssetsView["portal"]> = {}): AssetsView => ({
  portal: {
    slug: "press",
    name: "Acme press kit",
    intro: "Logos, product shots and executive portraits for press.",
    organization: "Acme Inc",
    access: "public",
    expiresAt: null,
    theme: { logo: null, accent: "#2f62ff", background: null },
    collections: [
      { id: "col_logos", name: "Logos", count: 14, covers: ["/a/ast_logo/w_640,f_webp", "/a/ast_mark/w_640,f_webp"] },
      { id: "col_press", name: "Press", count: 42, covers: ["/a/ast_hero/w_640,f_webp"] },
    ],
    brands: [],
    site: {},
    look: plainLook,
    madeWith: true,
    ...over,
  },
  data: publicItems.slice(0, 3).map((i) => ({ ...i, original: undefined, downloads: i.downloads.map((d) => ({ ...d, preset: d.label.toLowerCase() })) })),
  total: 3,
});

