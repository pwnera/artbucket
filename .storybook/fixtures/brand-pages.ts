import { delay, http, HttpResponse } from "msw";
import type { BrandInfo } from "@/components/brand-switcher";
import type { ImportRow } from "@/components/brand-import";
import type { BrandHub, BrandLook, BrandRow } from "@/components/brands";
import type { HubOffer } from "@/components/hub-offers";
import type { Portal } from "@/components/portals";
import type { HeadBrand } from "@/lib/brand-head";
import { deriveTheme } from "@/lib/brand-theme";
import type { PageView } from "@/lib/site";
import { acme, longBrand, NOW, northwind, rules } from "./brands";
import { picture } from "./library";

/**
 * What the brand pages draw (App/Features/Brands/*): the Brands page's rows with BrandHub and a card's look, the
 * portals a brand is on, a brand import at each stage with its plan, and a theme. Built on fixtures/brands (Acme,
 * Northwind); every name made up, every date fixed around NOW (15 October 2026).
 */

const at = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

// ---- the Brands page ------------------------------------------------------------------

/** GET /api/v1/brands/{slug}/hub: private, released twelve times, its portal picked by BrandHub. */
export const hub = (over: Partial<BrandHub> = {}): BrandHub => ({
  visibility: "private",
  url: "https://hub.artbucket.test/acme/acme",
  published: { number: 12, publishedAt: at(2) },
  portal: { slug: "acme", name: "Acme brand portal" },
  chosen: false,
  portals: [
    { slug: "acme", name: "Acme brand portal", access: "public" },
    { slug: "partners", name: "Partner portal", access: "password" },
  ],
  verified: "acme.test",
  ...over,
});

/** A card's look with no logo: tinted with `tint`, its palette as dots. */
const look = (tint: string, palette: string[] = [tint], over: Partial<BrandLook> = {}): BrandLook => ({
  tint,
  logo: null,
  background: null,
  palette: palette.map((hex, i) => ({ hex, name: ["Primary", "Ink", "Paper", "Signal"][i] ?? `Color ${i + 1}` })),
  face: null,
  ...over,
});

/** Acme's card as the page builds it from its rules: its logo (served by fixtures/brands `assetFiles`), Acme Blue, its palette. */
const acmeLook = look("#2f62ff", ["#2f62ff", "#0b1020", "#fbfaf7", "#ff5b1f"], { logo: "/a/ast_logo/w_320,f_webp", face: { family: "Inter", weight: 700, src: null } });

const row = (b: BrandInfo, h: BrandHub | null, l: BrandLook): BrandRow => ({ ...b, visibility: h?.visibility ?? "private", hub: h, look: l });

/** Acme public on BrandHub, Northwind never released, the long-named one with no BrandHub at all. */
export const brandRows: BrandRow[] = [
  row(acme, hub({ visibility: "public", chosen: true }), acmeLook),
  row(northwind, hub({ url: "https://hub.artbucket.test/acme/northwind", published: null, portal: null, portals: [], verified: null }), look("#14a874", ["#14a874", "#0b1020"])),
  row(longBrand, null, look("#7c3aed")),
];

const NAMES = ["Contoso", "Fabrikam", "Tailspin", "Wingtip", "Litware", "Adventure Works", "Proseware", "Woodgrove", "Lamna", "Fourth Coffee", "Margie's Travel", "Trey Research"];
const TINTS = ["#2f62ff", "#ff5b1f", "#14a874", "#7c3aed", "#f59e0b", "#0ea5e9", "#e11d48"];

/** A project with many brands: Acme first, then made-up ones, every other one public. */
export const manyRows = (n = 14): BrandRow[] => [
  brandRows[0],
  ...Array.from({ length: n - 1 }, (_, i) => {
    const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : "");
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const pub = i % 2 === 0;
    const h = hub({ url: `https://hub.artbucket.test/acme/${slug}`, visibility: pub ? "public" : "private", published: { number: i + 1, publishedAt: at(i * 3 + 1) }, portal: null, verified: null });
    return row({ id: `brd_${slug}`, slug, name, default: false, rules: (i * 7) % 30 }, h, look(TINTS[i % TINTS.length]));
  }),
];

/** GET /api/v1/hub/offers: a listing Acme's verified domain claims. */
export const offers: HubOffer[] = [
  { id: "off_acme", org: "unclaimed", owner: "Unclaimed brands", brand: "acme", name: "Acme", domain: "acme.test", proof: "acme.test", url: "https://hub.artbucket.test/unclaimed/acme" },
];

// ---- a brand's Settings and Sharing tabs ------------------------------------------------

/** Acme as the brand's tabs read it (lib/brand-head.ts): with its domain, open to the project. */
export const headAcme: HeadBrand = { ...acme, domain: "acme.test", private: false };
export const headNorthwind: HeadBrand = { ...northwind, domain: null, private: true };

const portal = (p: Partial<Portal> & Pick<Portal, "id" | "slug" | "name" | "access">): Portal => ({
  kind: "portal",
  intro: null,
  password: p.access === "password",
  expiresAt: null,
  expired: false,
  presets: ["web", "print", "social"],
  theme: { logo: null, accent: null, background: null },
  collections: [],
  brands: [{ slug: "acme", name: "Acme", publishedAt: at(2) }],
  site: {},
  rebuild: null,
  domain: null,
  url: `https://${p.slug}.artbucket.test`,
  pending: 0,
  createdBy: "Ada Lovelace",
  ...p,
});

/** GET /api/v1/sites, Acme's: the public portal BrandHub links, a partner portal with two people waiting, an expired one for members. */
export const portals: Portal[] = [
  portal({ id: "prt_acme", slug: "acme", name: "Acme brand portal", access: "public" }),
  portal({ id: "prt_partners", slug: "partners", name: "Partner portal", access: "password", pending: 2 }),
  portal({ id: "prt_team", slug: "acme-team", name: "Team handbook", access: "members", expired: true, expiresAt: at(5) }),
];

// ---- brand import ------------------------------------------------------------------------

/** me.brandImport in these stories: the importer's base address, answered by MSW. */
export const IMPORTER = "/brand-import";

const importRow = (over: Partial<ImportRow> & Pick<ImportRow, "id" | "filename" | "status">): ImportRow => ({
  bytes: 48_200_000,
  label: null,
  progress: null,
  error: null,
  startedBy: { id: "usr_ada", name: "Ada Lovelace" },
  at: at(1),
  brands: [],
  proposed: [],
  counts: null,
  appliedBy: null,
  appliedAt: null,
  undoneAt: null,
  undoing: false,
  tagging: null,
  archive: true,
  can: { open: true, edit: true, apply: true, undo: true, discard: true },
  ...over,
});

/** The project's latest imports, one of each kind the list tells apart. */
export const recentImports: ImportRow[] = [
  importRow({ id: "imp_ready", filename: "acme-brand-2026.zip", status: "ready", proposed: ["Acme", "Acme Kids"] }),
  importRow({ id: "imp_reading", filename: "northwind-guidelines.pdf", status: "processing", label: "Reading the guidelines", archive: false, bytes: 5_600_000 }),
  importRow({ id: "imp_applied", filename: "acme-press-kit.zip", status: "applied", appliedAt: at(9), appliedBy: { id: "usr_ada", name: "Ada Lovelace" } }),
  importRow({ id: "imp_failed", filename: "old-logos.zip", status: "failed", error: "The archive is damaged" }),
];

/** GET {importer}: what this project can import, and its latest imports. */
export const importStart = {
  notice: null,
  project: "Acme",
  max: 2 * 1024 ** 3,
  maxFiles: 10_000,
  partSize: 8 * 1024 ** 2,
  cap: 10_000,
  used: 1_240,
  brandRoom: null,
  imports: recentImports,
};

/** GET {importer}/{id} as these fixtures make it: what a story reads back, the rest as the page takes it. */
type ImportView = Record<string, unknown> & { id: string; status: string; can: { apply: boolean; undo: boolean; discard: boolean; edit: boolean; open: boolean } };

const file = (idx: number, path: string, over: Record<string, unknown> = {}) => {
  const name = path.split("/").pop()!;
  const ext = name.split(".").pop()!;
  return { idx, path, name, ext, size: 120_000 + idx * 1_000, kind: "logo", tags: [], description: "", sure: true, include: true, collection: null, brand: "b_acme", preview: /\.(svg|png|jpe?g)$/.test(name), ...over };
};

/** The logo files the importer matched, and the others a brand's logo could be picked from (GET .../files?kind=logo). */
export const logoFiles = [
  file(3, "Acme/Logos/acme-logo.svg", { description: "The Acme wordmark in blue" }),
  file(4, "Acme/Logos/acme-logo-white.svg", { description: "The Acme wordmark in white" }),
  file(5, "Acme/Logos/acme-mark.png"),
];

/** A collection's files (GET .../files?collection=), one the model wasn't sure of, one without a preview. */
export const collectionFiles = [
  file(10, "Acme/Photos/autumn-hero.jpg", { kind: "photo", tags: ["autumn", "outdoor", "hero"], collection: "c_photos" }),
  file(11, "Acme/Photos/team-offsite.jpg", { kind: "photo", tags: ["people"], sure: false, collection: "c_photos" }),
  file(12, "Acme/Photos/store-front.tif", { kind: "photo", ext: "tif", preview: false, collection: "c_photos" }),
];

const stated = (page: number) => ({ kind: "stated" as const, path: "Acme/Guidelines/acme-brand-book.pdf", page });
const inferred = { kind: "inferred" as const, paths: ["Kids/Artwork/poster.png", "Kids/Artwork/banner.png"] };

/** The plan: Acme read from its brand book into the Acme brand there is, Acme Kids inferred from its files, with a brand book that couldn't be read. */
export const plan = {
  brands: [
    {
      id: "b_acme",
      name: "Acme",
      include: true,
      target: "acme",
      logo: logoFiles[0],
      logos: [
        { key: "logo.primary", context: null, label: "Logo", idx: 3, by: "rules", cut: null, file: logoFiles[0] },
        { key: "logo.primary", context: "dark", label: "Logo on dark", idx: 4, by: "model", cut: null, file: logoFiles[1] },
        { key: "logo.mark", context: null, label: "Mark", idx: null, by: null, cut: { page: 7 }, file: null },
      ],
      book: { path: "Acme/Guidelines/acme-brand-book.pdf", idx: 1, modified: "2026-03-02T09:00:00Z" },
      books: [{ idx: 2, path: "Acme/Guidelines/acme-brand-book-2019.pdf", name: "acme-brand-book-2019.pdf", size: 9_800_000, modified: "2019-05-10T09:00:00Z", read: false, error: null }],
      inferred: [],
      rules: [
        { key: "color.primary", type: "color", value: "#2b5cff", label: "Acme Blue", include: true, diff: { current: "#2f62ff", take: true }, source: stated(4) },
        { key: "color.ink", type: "color", value: "#0b1020", label: "Ink", include: true, unchanged: true, source: stated(4) },
        { key: "color.accent", type: "color", value: "#ff5b1f", label: "Signal", include: true, source: stated(5) },
        { key: "font.heading", type: "font", value: { family: "Inter", weight: 700 }, label: "Headings", include: true, source: stated(9) },
        { key: "font.body", type: "font", value: { family: "Inter", weight: 400 }, label: "Body", include: false, source: stated(9) },
        { key: "voice.tone", type: "text", value: "Plain, warm and short.", include: true, source: stated(14) },
        { key: "logo.clearSpace", type: "number", value: 24, include: true, spec: { unit: "px" }, source: stated(7) },
      ],
      pages: [
        { slug: "overview", title: "Overview", include: true, sections: 3 },
        { slug: "logo", title: "Logo", include: true, sections: 5 },
        { slug: "color", title: "Color", include: true, sections: 2 },
        { slug: "photography", title: "Photography", include: false, sections: 4 },
      ],
      files: 214,
      fonts: ["Inter"],
    },
    {
      id: "b_kids",
      name: "Acme Kids",
      include: true,
      target: null,
      logo: null,
      logos: [],
      book: { path: "Kids/acme-kids-guidelines.pdf", idx: 20, error: "The PDF is protected by a password" },
      books: [],
      inferred: ["colors"],
      rules: [{ key: "color.primary", type: "color", value: "#f59e0b", include: true, source: inferred }],
      pages: [],
      files: 38,
      fonts: [],
    },
  ],
  collections: [
    { id: "c_logos", brand: "b_acme", name: "Logos", include: true, files: 12 },
    { id: "c_photos", brand: "b_acme", name: "Photos", include: true, files: 186 },
    { id: "c_kids", brand: "b_kids", name: "Kids artwork", include: false, files: 38 },
  ],
  existing: [
    { slug: "acme", name: "Acme" },
    { slug: "northwind", name: "Northwind" },
  ],
  loose: 4,
  total: 252,
  bytes: 46_100_000,
  skipped: [
    { idx: 30, path: "Acme/Logos/acme-logo.eps", why: "Another format of the same artwork", of: "Acme/Logos/acme-logo.svg" },
    { idx: 31, path: "__MACOSX/._acme-logo.svg", why: "A system file", of: null },
  ],
  unsure: 1,
  brandsBy: "model",
  room: { needed: 1, left: null },
  leftovers: { files: 6, include: false },
};

/** GET {importer}/{id}: the import at `status`, its plan ready to review unless said otherwise. */
export const importView = (status: string, over: Record<string, unknown> = {}): ImportView => ({
  id: "imp_ready",
  filename: "acme-brand-2026.zip",
  bytes: 48_200_000,
  status,
  stage: null,
  label: null,
  error: null,
  progress: null,
  stats: null,
  expires: "2026-10-29T12:00:00Z",
  plan: status === "ready" ? plan : null,
  applied: null,
  can: { apply: true, undo: false, discard: status === "ready", edit: true, open: true },
  waiting: false,
  startedBy: { id: "usr_ada", name: "Ada Lovelace" },
  at: "2026-10-14T16:01:00Z",
  appliedBy: null,
  appliedAt: null,
  undoUntil: null,
  undoPast: false,
  ...over,
});

/** What Apply made: Acme updated, Acme Kids made, some files tagged later, one that failed and a rule left as it was. */
export const applied = {
  brands: [
    { slug: "acme", name: "Acme", created: false, dropped: [{ what: "color.primary", why: "Acme's own was kept" }] },
    { slug: "acme-kids", name: "Acme Kids", created: true, dropped: [] },
  ],
  assets: 240,
  deduped: 8,
  left: 6,
  failed: [{ path: "Acme/Video/brand-reel.mov", error: "Files over 2 GB can't be brought in" }],
  collections: 2,
  warnings: ["Acme Kids has no logo yet: add one on its Rules tab."],
  tagging: { queued: 200, over: 40 },
  undo: null,
  undoing: false,
};

/** A brand-import preview image, drawn for its index, the same every time. */
export const importPreviews = http.get(`${IMPORTER}/:id/files/:idx/preview`, ({ params }) =>
  new HttpResponse(picture(`f${params.idx}`, 320, 240), { headers: { "Content-Type": "image/svg+xml" } }),
);

/**
 * The importer for an import page: `view` answers GET {importer}/{id}; the file lists and previews answer from the
 * fixtures; the signal (`?signal=1`) says nothing is at work.
 */
export const importer = (view: ImportView | null, status = 200) => [
  http.get(IMPORTER, ({ request }) =>
    new URL(request.url).searchParams.has("signal") ? HttpResponse.json({ data: { running: 0, waiting: 0, stopped: 0, latest: null } }) : HttpResponse.json({ data: importStart }),
  ),
  importPreviews,
  http.get(`${IMPORTER}/:id/files`, ({ request }) => {
    const u = new URL(request.url);
    const data = u.searchParams.get("kind") === "logo" ? logoFiles : collectionFiles;
    return HttpResponse.json({ data, total: u.searchParams.get("kind") ? data.length : 186 });
  }),
  http.get(`${IMPORTER}/:id`, async () => {
    await delay(50);
    return view ? HttpResponse.json({ data: view }, { status }) : HttpResponse.json({ error: { code: "not_found", message: "There's no such import in this project." } }, { status: 404 });
  }),
];

// ---- the theme ------------------------------------------------------------------------------

/** Acme's theme as GET .../view?edit=1 has it: drawn from its rules, nothing set by hand. */
export const theme: PageView["theme"] = { ...deriveTheme(rules), settings: {} } as PageView["theme"];

/** Two pairs that fall short, so a color that reads stands in. */
export const failingTheme: PageView["theme"] = {
  ...theme,
  checks: [
    ...theme.checks.slice(0, 2),
    { pair: "signal on paper", fg: "#ff5b1f", bg: "#fbfaf7", ratio: 2.9, need: 4.5, ok: false, used: "#c2410c" },
    { pair: "muted on panel", fg: "#9ca3af", bg: "#f3f4f6", ratio: 2.3, need: 4.5, ok: false, used: "#4b5563" },
  ],
};
