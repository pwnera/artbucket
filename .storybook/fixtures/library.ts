import type { Decorator } from "@storybook/nextjs-vite";
import { createElement } from "react";
import { delay, http, HttpResponse } from "msw";
import { AccessProvider } from "@/components/can";
import { Shell } from "@/components/shell";
import type { Me } from "@/components/account";
import type { Page as ActivityPage } from "@/components/activity";
import type { BrandAsset } from "@/components/brand-assets";
import type { Collection } from "@/components/collections";
import type { Asset, Listing } from "@/components/gallery";
import type { InsightsData } from "@/components/insights";
import type { PublicItem } from "@/components/public-grid";
import type { ShareLink } from "@/components/share-dialog";
import type { Upload } from "@/components/uploads";
import type { FieldDef } from "@/lib/fields";
import type { Scope } from "@/lib/scopes";
import type { SidebarData } from "@/lib/sidebar";

/**
 * The library as stories see it: Acme's assets in every format the gallery tells apart, its collections, versions,
 * activity, people and share links. Dates are fixed (October 2026) and every name is made up. Pictures are drawn
 * here as SVG and served by `renditions`, so `/a/{id}/w_260,f_webp` shows a picture without a server.
 */

/** The moment the fixtures happen at: freeze Date.now to it where a story reads relative time. */
export const NOW = Date.parse("2026-10-15T10:00:00Z");
const at = (daysAgo: number, hour = 9) => new Date(NOW - daysAgo * 86_400_000 + (hour - 10) * 3_600_000).toISOString();

// ---- people -----------------------------------------------------------------------

const PROJECT = { id: "prj_acme", slug: "acme", name: "Acme", organization: { id: "org_acme", slug: "acme", name: "Acme Inc" } };

/** Who is looking, at a role on the whole project: `admin` manages people, `read` only looks. */
export const me = (scope: Scope = "admin", over: Partial<Me> = {}): Me => ({
  user: { id: "usr_dana", name: "Dana Reyes", email: "dana@acme.test" },
  key: false,
  actor: "Dana Reyes",
  project: PROJECT,
  scope,
  orgScope: scope,
  narrowed: false,
  email: true,
  narrow: { collections: {}, assets: {}, brands: {} },
  hidden: [],
  projects: [PROJECT],
  features: null,
  off: [],
  upgrade: null,
  billing: null,
  git: null,
  assistant: null,
  brandImport: null,
  hub: false,
  hubUrl: null,
  notice: null,
  feedback: null,
  joinable: null,
  auth: { signUp: true, setupToken: false, open: false, oidc: null, google: false, sso: false, anonymous: null, passwordReset: true, serverEmail: true, captcha: null, turnstile: null },
  ...over,
});

const grant = (id: string, resource: "organization" | "project" | "collection" | "asset", resourceId: string, scope: Scope) => ({
  id,
  resource,
  resourceId,
  projectId: resource === "organization" ? null : PROJECT.id,
  label: null,
  scope,
});

/** GET /api/v1/members?in=project: an admin, an editor on the asset, one through a collection, and two who could be added. */
export const members = [
  { id: "usr_dana", name: "Dana Reyes", email: "dana@acme.test", grants: [grant("g1", "organization", "org_acme", "admin")] },
  { id: "usr_omar", name: "Omar Haddad", email: "omar@acme.test", grants: [grant("g2", "asset", "ast_hero", "write")] },
  { id: "usr_lena", name: "Lena Park", email: "lena@northwind.test", grants: [grant("g3", "collection", "col_campaign", "read")] },
  { id: "usr_sam", name: "Sam Okafor", email: "sam@acme.test", grants: [grant("g4", "project", PROJECT.id, "read")] },
  { id: "usr_ivy", name: "", email: "ivy@studio.test", grants: [grant("g5", "project", PROJECT.id, "propose")] },
];

// ---- pictures ------------------------------------------------------------------------

const PALETTE = ["#2f62ff", "#ff5b1f", "#14a874", "#c6f432", "#7c3aed", "#f59e0b", "#0ea5e9", "#e11d48"];

/** A picture for an id: a shape on a color of its own, the same every time. */
export function picture(id: string, w = 800, h = 600) {
  let n = 0;
  for (const c of id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  const bg = PALETTE[n % PALETTE.length];
  const fg = PALETTE[(n >> 3) % PALETTE.length] === bg ? "#ffffff" : PALETTE[(n >> 3) % PALETTE.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${bg}"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 3}" fill="${fg}" opacity="0.9"/><rect x="${w / 8}" y="${h * 0.7}" width="${w * 0.75}" height="${h / 12}" rx="${h / 24}" fill="#ffffff" opacity="0.7"/></svg>`;
}

/** A one-ink icon, as an icon pack brings them. */
const GLYPH = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/></svg>`;

/** Every /a/ address: a picture for images and stills, the glyph for an icon, a refusal for the rest (a font, a clip). */
export const renditions = [
  http.get("/a/ast_loader*", () => HttpResponse.json({ v: "5.7.4", fr: 30, ip: 0, op: 30, w: 100, h: 100, layers: [] })),
  http.get("/a/ast_icon_star*", () => new HttpResponse(GLYPH, { headers: { "Content-Type": "image/svg+xml" } })),
  http.get("/a/:id/:spec", ({ params }) => new HttpResponse(picture(String(params.id)), { headers: { "Content-Type": "image/svg+xml" } })),
  http.get("/a/:id", ({ params }) => {
    const a = assets.find((x) => x.id === params.id);
    if (a && (a.mime.startsWith("image/") || a.probe?.preview)) return new HttpResponse(picture(a.id), { headers: { "Content-Type": "image/svg+xml" } });
    return new HttpResponse(null, { status: 404 });
  }),
];

// ---- assets ---------------------------------------------------------------------------

/** An approved, current image with nothing waiting: what each fixture changes. */
export const asset = (over: Partial<Asset> & Pick<Asset, "id" | "filename">): Asset => ({
  mime: "image/jpeg",
  size: 2_480_000,
  width: 4096,
  height: 2731,
  probe: null,
  tags: [],
  fields: {},
  inherited: {},
  collections: [],
  status: "active",
  state: "active",
  stackId: null,
  version: null,
  current: true,
  proposedBy: null,
  reviewNote: null,
  proposedTags: [],
  rights: null,
  origin: null,
  via: null,
  parentAssetId: null,
  generator: null,
  prompt: null,
  c2pa: null,
  supersededBy: null,
  metadata: null,
  public: false,
  createdAt: at(12),
  updatedAt: at(3),
  ...over,
});

/** One of each kind the gallery draws differently, and the states it badges. */
export const assets: Asset[] = [
  asset({
    id: "ast_hero",
    filename: "autumn-campaign-hero.jpg",
    metadata: { title: "Autumn campaign hero", creator: "Lena Park" },
    tags: ["campaign", "autumn", "hero", "outdoor"],
    collections: ["col_campaign"],
    stackId: "stk_hero",
    version: 3,
    createdAt: at(2),
  }),
  asset({
    id: "ast_logo",
    filename: "acme-logo.svg",
    mime: "image/svg+xml",
    size: 4_210,
    width: 640,
    height: 200,
    probe: { hasAlpha: true },
    tags: ["logo"],
    collections: ["col_logos"],
    public: true,
    metadata: { title: "Acme logo, full color" },
  }),
  asset({ id: "ast_icon_star", filename: "star.svg", mime: "image/svg+xml", size: 312, width: 24, height: 24, probe: { mono: true }, tags: ["icon"] }),
  asset({ id: "ast_mark", filename: "acme-mark.png", mime: "image/png", size: 88_000, width: 1024, height: 1024, probe: { hasAlpha: true }, tags: ["logo", "mark"] }),
  asset({ id: "ast_reel", filename: "brand-reel-2026.mp4", mime: "video/mp4", size: 48_200_000, width: 1920, height: 1080, probe: { preview: "still", duration: 94 }, tags: ["video"] }),
  asset({ id: "ast_loader", filename: "loader.lottie", mime: "application/zip", size: 21_400, width: null, height: null, probe: { lottie: true }, tags: ["motion"] }),
  asset({ id: "ast_font", filename: "AcmeSans-Bold.woff2", mime: "font/woff2", size: 61_000, width: null, height: null, tags: ["type"] }),
  asset({ id: "ast_guide", filename: "brand-guidelines.pdf", mime: "application/pdf", size: 5_600_000, width: 1240, height: 1754, probe: { preview: "page-1" }, metadata: { title: "Brand guidelines 2026" } }),
  asset({ id: "ast_press", filename: "press-kit.zip", mime: "application/zip", size: 182_000_000, width: null, height: null }),
  asset({
    id: "ast_figma",
    filename: "Homepage redesign",
    mime: "text/uri-list",
    size: 0,
    width: null,
    height: null,
    probe: { service: "Figma", embed: "https://www.figma.com/embed?embed_host=artbucket&url=x" },
  }),
  asset({
    id: "ast_ai",
    filename: "generated-moodboard.png",
    mime: "image/png",
    size: 3_100_000,
    width: 2048,
    height: 2048,
    status: "proposed",
    state: "proposed",
    origin: "generated",
    via: "agent",
    generator: "Acme Image Model",
    prompt: "autumn leaves over a city street, warm light",
    proposedBy: "Campaign agent",
    proposedTags: ["autumn", "moodboard"],
    rights: { license: null, territories: [], channels: [], embargo: null, expires: null, modelRelease: "missing" },
    createdAt: at(0, 8),
    updatedAt: at(0, 8),
  }),
  asset({
    id: "ast_old_logo",
    filename: "acme-logo-2019.png",
    mime: "image/png",
    size: 120_000,
    width: 1200,
    height: 400,
    supersededBy: "ast_logo",
    tags: ["logo", "legacy"],
  }),
  asset({
    id: "ast_expiring",
    filename: "stock-runner.jpg",
    rights: { license: "Northwind Stock, editorial and web", territories: ["DE", "FR"], channels: ["web"], embargo: null, expires: "2026-10-30", modelRelease: "released" },
    tags: ["stock", "people"],
  }),
  asset({ id: "ast_archived", filename: "summer-2025-banner.jpg", status: "archived", state: "archived", tags: ["summer"] }),
  asset({
    id: "ast_long",
    filename: "acme-northwind-co-branded-retail-window-display-final-final-approved-v12-print-ready-cmyk.tif",
    mime: "image/tiff",
    size: 412_000_000,
    width: 12000,
    height: 8000,
    tags: ["retail", "print", "co-branded", "northwind", "window"],
    metadata: { title: "Acme and Northwind co-branded retail window display, print-ready, final approved version" },
  }),
];

export const byId = (id: string) => assets.find((a) => a.id === id)!;

/** Many, for a full grid and Load more: the first twelve again under new ids. */
export const many = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const base = assets[i % 12];
    return { ...base, id: `${base.id}_${i}`, filename: base.filename.replace(/(\.\w+)?$/, `-${i + 1}$1`), metadata: null };
  });

/** GET /api/v1/assets: a page of `data`, with facets. */
export const listing = (data: Asset[], total = data.length): Listing => ({
  data,
  total,
  facets: {
    tags: [
      { value: "logo", count: 4 },
      { value: "campaign", count: 2 },
      { value: "autumn", count: 2 },
      { value: "icon", count: 1 },
    ],
    types: [
      { value: "image", count: 9 },
      { value: "video", count: 1 },
      { value: "font", count: 1 },
      { value: "document", count: 2 },
    ],
    states: [
      { value: "active", count: 12 },
      { value: "proposed", count: 1 },
      { value: "archived", count: 1 },
    ],
    fields: {},
  },
});

/** The asset's stack: v1 and v2 before, v3 current. */
export const versions: Asset[] = [
  { ...byId("ast_hero"), id: "ast_hero_v1", version: 1, current: false, createdAt: at(40), metadata: { title: "Autumn campaign hero, first cut" } },
  { ...byId("ast_hero"), id: "ast_hero_v2", version: 2, current: false, status: "archived", state: "archived", createdAt: at(20) },
  byId("ast_hero"),
];

// ---- collections, fields, shares ----------------------------------------------------------

export const collections: Collection[] = [
  { id: "col_campaign", name: "Autumn campaign", icon: "leaf", fields: { region: "EMEA" }, count: 128, createdAt: at(30) },
  { id: "col_logos", name: "Logos", icon: "star", fields: {}, count: 14, createdAt: at(90) },
  { id: "col_press", name: "Press", icon: "speakerphone", fields: {}, count: 42, createdAt: at(60) },
  { id: "col_legal", name: "Legal review", icon: "briefcase", fields: {}, private: true, count: 6, createdAt: at(10) },
];

export const fields: FieldDef[] = [
  { key: "region", label: "Region", type: "select", options: ["EMEA", "Americas", "APAC"], required: false },
  { key: "campaign_code", label: "Campaign code", type: "text", options: [], required: false },
];

export const shareLink = (over: Partial<ShareLink> = {}): ShareLink => ({
  id: "shr_press",
  kind: "view",
  name: "Press kit for Northwind",
  target: { type: "collection", id: "col_press", label: "Press" },
  url: "https://acme.artbucket.page/s/k3x9q2",
  password: false,
  expiresAt: "2026-11-15T22:59:59.000Z",
  expired: false,
  createdBy: "Dana Reyes",
  createdAt: at(4),
  ...over,
});

// ---- the shell ----------------------------------------------------------------------------

/** What the (app) layout hands the shell: the sidebar's lists and who is looking. */
export const sidebar = (scope: Scope = "admin", over: Partial<SidebarData> = {}): SidebarData => ({
  collections,
  brands: [{ id: "brd_acme", slug: "acme", name: "Acme", default: true, rules: 24 }],
  searches: [{ id: "srch_logos", name: "Approved logos", query: "tag=logo" }],
  reviewCount: 1,
  fixesCount: 0,
  me: me(scope),
  ...over,
});

// ---- uploads ---------------------------------------------------------------------------------

export const uploads: Upload[] = [
  { id: "u1", name: "autumn-lookbook-01.jpg", size: 4_200_000, loaded: 4_200_000, status: "done", assetId: "ast_hero" },
  { id: "u2", name: "autumn-lookbook-02.jpg", size: 3_900_000, loaded: 1_700_000, status: "uploading" },
  { id: "u3", name: "brand-reel-cutdown.mp4", size: 88_000_000, loaded: 0, status: "queued" },
  { id: "u4", name: "acme-logo-copy.svg", size: 4_210, loaded: 4_210, status: "deduped", assetId: "ast_logo" },
  { id: "u5", name: "huge-master-file.psd", size: 2_100_000_000, loaded: 0, status: "failed", error: "Files over 2 GB can't be uploaded here" },
];

// ---- portal and share items --------------------------------------------------------------------

const dl = (id: string, filename: string) => [
  { label: "Web", hint: "1200 px WebP", url: `/a/${id}/w_1200,f_webp?s=sig`, filename: filename.replace(/\.\w+$/, ".webp") },
  { label: "Print", hint: "Full size JPEG", url: `/a/${id}/w_2400,q_85,f_jpeg?s=sig`, filename: filename.replace(/\.\w+$/, ".jpg") },
  { label: "Original", hint: "As uploaded", url: `/a/${id}?download&s=sig`, filename },
];

export const publicItem = (a: Asset, over: Partial<PublicItem> = {}): PublicItem => ({
  id: a.id,
  filename: a.filename,
  title: a.metadata?.title ?? null,
  description: a.metadata?.description ?? null,
  creator: a.metadata?.creator ?? null,
  copyright: null,
  mime: a.mime,
  size: a.size,
  width: a.width,
  height: a.height,
  thumbnail: a.mime.startsWith("image/") || a.probe?.preview ? `/a/${a.id}/w_640,f_webp` : null,
  preview: a.mime.startsWith("image/") || a.probe?.preview ? `/a/${a.id}/w_1600,f_webp` : null,
  downloads: dl(a.id, a.filename),
  original: `/a/${a.id}?s=sig`,
  ...over,
});

export const publicItems: PublicItem[] = [
  publicItem(byId("ast_hero"), { description: "Shot in Lisbon for the autumn launch. Credit Lena Park.", copyright: "Acme Inc" }),
  publicItem(byId("ast_logo")),
  publicItem(byId("ast_mark"), { downloads: dl("ast_mark", "acme-mark.png").slice(2) }),
  publicItem(byId("ast_reel")),
  publicItem(byId("ast_guide")),
  publicItem(byId("ast_font"), { downloads: [] }),
  publicItem(byId("ast_press")),
];

// ---- activity ------------------------------------------------------------------------------

type Item = ActivityPage["data"][number];
const event = (id: string, over: Partial<Item>): Item => ({
  id,
  at: at(0),
  actor: "Dana Reyes",
  agent: false,
  verb: "added",
  label: "autumn-campaign-hero.jpg",
  assetId: "ast_hero",
  brand: null,
  detail: null,
  ...over,
});

export const activity: ActivityPage = {
  next: null,
  data: [
    event("ev1", { at: at(0, 9), actor: "Campaign agent", agent: true, verb: "suggested", label: "generated-moodboard.png", assetId: "ast_ai" }),
    event("ev2", { at: at(0, 8), actor: "Campaign agent", agent: true, verb: "suggested", label: "autumn-lookbook-02.jpg", assetId: "ast_lb2" }),
    event("ev3", { at: at(0, 7), actor: "Campaign agent", agent: true, verb: "suggested", label: "autumn-lookbook-03.jpg", assetId: "ast_lb3" }),
    event("ev4", { at: at(0, 6), verb: "suggested_tags", detail: { tags: ["autumn", "outdoor"] }, actor: "Tagger", agent: true }),
    event("ev5", { at: at(1, 16), verb: "rejected", label: "blurry-shot.jpg", assetId: "ast_blurry", detail: { note: "Out of focus, and the logo is cropped" } }),
    event("ev6", { at: at(1, 15), verb: "deleted", actor: "Omar Haddad", label: "draft-banner.png", assetId: "ast_draft" }),
    event("ev7", { at: at(1, 11), verb: "published", label: "Acme", assetId: null, brand: { slug: "acme", name: "Acme", version: 29 } }),
    event("ev8", { at: at(2, 14), verb: "edited_rules", label: "Acme", assetId: null, brand: { slug: "acme", name: "Acme", version: 28 }, detail: { rules: ["color.primary", "logo.clearspace", "type.heading", "voice.tone", "logo.minimum"] } }),
    event("ev9", { at: at(2, 10), verb: "made_current", label: "autumn-campaign-hero.jpg", detail: { version: 3 } }),
    event("ev10", { at: at(3, 9), actor: "web", verb: "added", label: "uploaded-by-guest.jpg", assetId: "ast_guest" }),
  ],
};

// ---- insights -------------------------------------------------------------------------------

const ref = (a: Asset) => ({ id: a.id, title: a.metadata?.title ?? a.filename, version: a.version, preview: true, supersededBy: a.supersededBy });
const weeks = ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"];

export const insights: InsightsData = {
  days: 30,
  weeks: 6,
  answers: weeks.map((week, i) => ({ week, person: 120 + i * 30, agent: 40 + i * 25, anonymous: 300 + ((i * 70) % 160) })),
  adoption: weeks.map((week, i) => ({ week, current: 400 + i * 60, superseded: 160 - i * 20 })),
  stale: [
    {
      asset: ref(byId("ast_old_logo")),
      replacement: ref(byId("ast_logo")),
      referrer: "shop.northwind.test",
      client: null,
      fetches: 412,
      first: "2026-09-20",
      last: "2026-10-14",
      owners: 2,
      notified: null,
    },
    {
      asset: ref(byId("ast_old_logo")),
      replacement: ref(byId("ast_logo")),
      referrer: null,
      client: "Newsletter agent",
      fetches: 37,
      first: "2026-10-01",
      last: "2026-10-12",
      owners: 1,
      notified: { at: at(2), by: "Dana Reyes" },
    },
  ],
  top: [
    { asset: ref(byId("ast_logo")), total: 18_400, surfaces: { portal: 9_800, api: 4_100, mcp: 3_200, app: 1_300 } },
    { asset: ref(byId("ast_hero")), total: 6_200, surfaces: { share: 3_000, app: 3_200 } },
    { asset: ref(byId("ast_guide")), total: 940, surfaces: { hub: 940 } },
  ],
  gaps: [
    { q: "holiday banner", searches: 23, first: "2026-10-02", last: "2026-10-14", requested: null },
    { q: "logo white", searches: 9, first: "2026-09-21", last: "2026-10-11", requested: { at: at(5), by: "Dana Reyes" } },
  ],
  checks: {
    allowed: 1_240,
    refused: 86,
    reasons: [
      { code: "superseded", count: 51 },
      { code: "territory", count: 22 },
      { code: "expired", count: 13 },
    ],
    log: [
      {
        id: "chk1",
        at: at(0, 9),
        asset: ref(byId("ast_old_logo")),
        surface: "mcp",
        client: "Newsletter agent",
        context: "dark-background",
        reasons: ["superseded"],
        offered: [{ asset: ref(byId("ast_logo")), taken: true }],
      },
      { id: "chk2", at: at(1, 14), asset: ref(byId("ast_expiring")), surface: "portal", client: null, context: null, reasons: ["territory"], offered: [] },
    ],
  },
  delivery: Array.from({ length: 14 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, "0")}`, requests: 900 + ((i * 137) % 600), bytes: 2_000_000_000 + ((i * 310_000_000) % 1_500_000_000) })),
  pageViews: [
    { portal: { id: "prt_press", name: "Press portal" }, brand: { slug: "acme", name: "Acme" }, page: "Logo", views: 1_820 },
    { portal: { id: "prt_press", name: "Press portal" }, brand: { slug: "acme", name: "Acme" }, page: "Colors", views: 940 },
    { portal: { id: "prt_partners", name: "Partners" }, brand: { slug: "acme", name: "Acme" }, page: "Logo", views: 310 },
  ],
};

// ---- a brand's files ------------------------------------------------------------------------------

export const brandAssets: BrandAsset[] = [
  { id: "ast_logo", title: "Acme logo, full color", filename: "acme-logo.svg", mime: "image/svg+xml", width: 640, height: 200, preview: true, rules: ["logo.primary"], pages: [{ slug: "logo", title: "Logo" }] },
  { id: "ast_mark", title: "Acme mark", filename: "acme-mark.png", mime: "image/png", width: 1024, height: 1024, preview: true, rules: ["logo.mark", "logo.favicon"], pages: [] },
  { id: "ast_hero", title: "Autumn campaign hero", filename: "autumn-campaign-hero.jpg", mime: "image/jpeg", width: 4096, height: 2731, preview: true, rules: [], pages: [{ slug: "photography", title: "Photography" }] },
  { id: "ast_font", title: "Acme Sans Bold", filename: "AcmeSans-Bold.woff2", mime: "font/woff2", width: null, height: null, preview: false, rules: ["type.heading"], pages: [] },
  { id: "ast_font_r", title: "Acme Sans Regular", filename: "AcmeSans-Regular.woff2", mime: "font/woff2", width: null, height: null, preview: false, rules: ["type.body"], pages: [] },
  { id: "ast_guide", title: "Brand guidelines 2026", filename: "brand-guidelines.pdf", mime: "application/pdf", width: null, height: null, preview: false, rules: [], pages: [{ slug: "downloads", title: "Downloads" }] },
];

export const brandRules = [
  { key: "logo.primary", label: "Primary logo" },
  { key: "logo.mark", label: null },
  { key: "logo.favicon", label: "Favicon" },
  { key: "type.heading", label: "Heading typeface" },
  { key: "type.body", label: null },
];

// ---- handlers ---------------------------------------------------------------------------------------

/** What the library's pages read, answered from the fixtures; a story adds its own on top for a state. */
export const library = (data: Asset[] = assets) => [
  ...renditions,
  http.get("/api/v1/assets", ({ request }) => {
    const u = new URL(request.url);
    if (u.searchParams.get("review") === "true") return HttpResponse.json(listing(data.filter((a) => a.status === "proposed")));
    return HttpResponse.json(listing(data));
  }),
  http.get("/api/v1/assets/:id", ({ params }) => {
    const a = data.find((x) => x.id === params.id) ?? assets.find((x) => x.id === params.id);
    return a ? HttpResponse.json({ data: a }) : HttpResponse.json({ error: { code: "not_found", message: "No such asset" } }, { status: 404 });
  }),
  http.get("/api/v1/assets/:id/versions", () => HttpResponse.json({ data: versions })),
  http.get("/api/v1/assets/:id/insights", () =>
    HttpResponse.json({ data: { days: 30, rules: [], pages: [], portals: [], fetches: { total: 1_300, surfaces: { app: 1_300 } }, referrers: [] } }),
  ),
  http.get("/api/v1/collections", () => HttpResponse.json({ data: collections })),
  http.get("/api/v1/fields", () => HttpResponse.json({ data: fields })),
  http.get("/api/v1/members", () => HttpResponse.json({ data: members, invitations: [] })),
  http.get("/api/v1/shares", () => HttpResponse.json({ data: [shareLink()] })),
];

/** A write that answers after a beat with what was sent back as the asset: PATCH and the like. */
export const echo = (path: string) =>
  http.patch(path, async ({ params, request }) => {
    await delay(150);
    const body = (await request.json()) as Partial<Asset>;
    return HttpResponse.json({ data: { ...(assets.find((a) => a.id === params.id) ?? assets[0]), ...body } });
  });

// ---- the app around a page --------------------------------------------------------------------------

/** A story's `parameters.app`: the role of who is looking (admin when left out) and what the sidebar holds. */
export type App = { scope?: Scope; me?: Partial<Me>; sidebar?: Partial<SidebarData> };

type Holder<P> = React.FC<P & { children?: React.ReactNode }>;

/**
 * The app around a story, as the (app) layout draws it: who is looking (AccessProvider) and the shell (sidebar,
 * lists, the collection dialog) that the library's pages read through useShell. The sidebar starts folded.
 */
export const inApp: Decorator = function InApp(Story, { parameters }) {
  const { scope = "admin", me: who = {}, sidebar: over = {} } = (parameters.app ?? {}) as App;
  const data = sidebar(scope, { ...over, me: me(scope, who) });
  return createElement(
    AccessProvider as Holder<{ me: Me }>,
    { me: data.me },
    createElement(Shell as Holder<{ sidebar: SidebarData; defaultOpen: boolean; defaultWidth: number | null }>, { sidebar: data, defaultOpen: false, defaultWidth: null }, createElement(Story)),
  );
};

/** Only who is looking, for a part that reads permissions and nothing of the shell. */
export const as: Decorator = function As(Story, { parameters }) {
  const { scope = "admin", me: who = {} } = (parameters.app ?? {}) as App;
  return createElement(AccessProvider as Holder<{ me: Me }>, { me: me(scope, who) }, createElement(Story));
};
