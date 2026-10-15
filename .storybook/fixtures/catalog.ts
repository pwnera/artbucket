import { delay, http, HttpResponse } from "msw";
import { catalogItems, groups, lineage, members, NOW } from "#.storybook/fixtures/brands";
import type { Described } from "@/components/catalog";
import type { ActivityLine, CatalogItem, Granted, Holder } from "@/lib/core/catalog";

/**
 * The catalog page as stories see it (/catalog): the objects of fixtures/brands described as GET /api/v1/catalog/{id}
 * answers, with who reaches each and what happened to it. Fixed dates and made-up names only.
 */

const at = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const byId = (id: string) => catalogItems.find((i) => i.id === id)!;

/** An object of the catalog as its page has it: what uses it, its lineage's size, where it is shared and its own page. */
export const describe = (id: string, over: Partial<Described> = {}): Described => ({
  ...byId(id),
  usedBy: [],
  usedByCount: 0,
  lineage: { up: 0, down: 0 },
  sharedWith: [],
  open: `/catalog?o=${id}`,
  ...over,
});

/** The logo: used by Acme and the press kit, with lineage both ways, shared with Northwind. */
export const logo = describe("ast_logo", {
  usedBy: [byId("brd_acme"), byId("col_press")],
  usedByCount: 2,
  lineage: { up: 1, down: 3 },
  sharedWith: [{ grant: "grt_share_nw", project: { id: "prj_northwind", slug: "northwind", name: "Northwind" }, role: "Viewer" }],
  open: "/?asset=ast_logo",
  tags: ["logo", "primary"],
});

/** Acme: released, with a description, used by its portal. */
export const acmeBrand = describe("brd_acme", { usedBy: [byId("sit_portal")], usedByCount: 1, lineage: { up: 1, down: 2 }, open: "/brands/acme" });

/** The portal: nothing records its activity here, and it has its own access settings. */
export const portal = describe("sit_portal", { lineage: { up: 2, down: 0 }, open: "/sites/acme" });

/** A rule of Acme's: a part of the brand, nothing linking to it. */
export const primaryRule = describe("rul_primary", { open: "/brands/acme/rules" });

/** Everything the stories open by id. */
export const described: Record<string, Described> = Object.fromEntries([logo, acmeBrand, portal, primaryRule].map((d) => [d.id, d]));
/** Anything else in the tree, described plainly. */
export const describeAny = (id: string) => described[id] ?? describe(id);

const holder = (h: Holder) => h;
/** GET /api/v1/catalog/ast_logo/access: Ada through the organization, Grace on the project, an agent, Northwind by a share, and the press kit's grant. */
export const access: { private: boolean; holders: Holder[]; on: { type: "asset"; id: string; name: string }; granted: Granted[] } = {
  private: false,
  holders: [
    holder({ kind: "person", who: "Ada Lovelace", role: "Admin", scope: "admin", via: "Organization Acme" }),
    holder({ kind: "person", who: "Grace Hopper", role: "Editor", scope: "write", via: "Project Acme" }),
    holder({ kind: "person", who: "Linus Nakamura", role: "Viewer", scope: "read", via: "Collection Press kit" }),
    holder({ kind: "agent", who: "Brand bot", role: "Contributor", scope: "propose", via: "Agent key on Acme, capped at Ada Lovelace" }),
    holder({ kind: "project", who: "Northwind", role: "Viewer", scope: "read", via: "Shared from Acme: its members read the latest release" }),
  ],
  on: { type: "asset", id: "ast_logo", name: "acme-logo.svg" },
  granted: [{ grant: "grt_linus_logo", kind: "person", id: "usr_linus", who: "Linus Nakamura", scope: "read" }],
};

/** GET /api/v1/catalog/{id}/activity: the logo's last few changes, one by an agent. */
export const activity: ActivityLine[] = [
  { at: at(1), who: "Ada Lovelace", what: "uploaded version 3", agent: false },
  { at: at(4), who: "Brand bot", what: "suggested the tags logo and primary", agent: true },
  { at: at(30), who: "Grace Hopper", what: "approved it", agent: false },
];

/**
 * What the catalog page reads beside its props: an object's access, activity and lineage, and the people and groups
 * a grant offers. `failing` makes the access and activity tabs answer 500.
 */
export const catalogApi = ({ failing = false } = {}) => [
  http.get("/api/v1/catalog/:id/access", async ({ params }) => {
    await delay(100);
    if (failing) return new HttpResponse(null, { status: 500 });
    return HttpResponse.json(params.id === "ast_logo" ? access : { private: false, holders: access.holders.slice(0, 2), on: null, granted: [] });
  }),
  http.get("/api/v1/catalog/:id/activity", async ({ params }) => {
    await delay(100);
    if (failing) return new HttpResponse(null, { status: 500 });
    return HttpResponse.json({ data: params.id === "ast_logo" ? activity : [] });
  }),
  http.get("/api/v1/catalog/:id/lineage", () => HttpResponse.json(lineage)),
  http.get("/api/v1/members", () => HttpResponse.json({ data: members.data.map(({ id, name, email }) => ({ id, name, email })) })),
  http.get("/api/v1/groups", () => HttpResponse.json({ data: groups })),
];

/** Many assets, for a folder that shows them a page at a time. */
export const manyAssets = (n: number): CatalogItem[] =>
  Array.from({ length: n }, (_, i) => ({ ...byId("ast_hero"), id: `ast_bulk_${i}`, slug: `photo-${i}`, name: `photo-${String(i + 1).padStart(3, "0")}.jpg`, expiring: false, expires: null }));

// ---- BrandHub: the public catalog of brands (app/hub) ----

type HubCard = import("@/lib/core/hub").HubCard;
const card = (c: Partial<HubCard> & Pick<HubCard, "id" | "org" | "brand" | "name">): HubCard => ({
  owner: c.org.charAt(0).toUpperCase() + c.org.slice(1),
  domain: null,
  visibility: "public",
  path: `/${c.org}/${c.brand}`,
  version: 1,
  publishedAt: at(10),
  verified: null,
  pulls: 0,
  tagline: null,
  tint: null,
  swatches: [],
  background: null,
  palette: [],
  face: null,
  colors: 0,
  families: [],
  logos: 0,
  logo: null,
  ...c,
});

/**
 * Listings as GET /hub answers them: Acme (verified, its logo, trending), Northwind (a community listing naming a
 * domain nobody proved, so claimable), a private one, and a long-named one. Logos are `/a/...` (fixtures/brands
 * `assetFiles` answers them).
 */
export const hubCards: HubCard[] = [
  card({
    id: "brd_acme",
    org: "acme",
    brand: "acme",
    name: "Acme",
    domain: "acme.test",
    verified: "acme.test",
    version: 12,
    publishedAt: at(2),
    pulls: 1_284,
    tagline: "Tools for every kind of maker.",
    tint: "#2f62ff",
    swatches: ["#2f62ff", "#0b1020", "#fbfaf7", "#ff5b1f"],
    palette: [
      { hex: "#2f62ff", name: "Acme Blue" },
      { hex: "#0b1020", name: "Ink" },
      { hex: "#ff5b1f", name: "Signal" },
    ],
    face: { family: "Inter", weight: 700, src: null },
    colors: 4,
    families: ["Inter"],
    logos: 1,
    logo: "/a/ast_logo/h_240,f_webp",
  }),
  card({
    id: "brd_northwind",
    org: "unclaimed",
    owner: "Unclaimed brands",
    brand: "northwind",
    name: "Northwind",
    domain: "northwind.test",
    version: 3,
    pulls: 96,
    tagline: "Fresh produce, delivered.",
    tint: "#14a874",
    palette: [{ hex: "#14a874", name: "Leaf" }],
    colors: 1,
  }),
  card({ id: "brd_contoso", org: "contoso", brand: "intranet", name: "Contoso intranet", visibility: "private", version: 4, tint: "#7c3aed", colors: 2, palette: [{ hex: "#7c3aed", name: "Violet" }] }),
  card({
    id: "brd_long",
    org: "acme-international-holdings",
    brand: "partner-programme",
    name: "Acme International Holdings Partner Programme for Resellers",
    version: 27,
    tagline: "Everything a reseller needs to sell Acme in their own shop, online or on paper, in every market we serve.",
    publishedAt: at(400),
  }),
];
