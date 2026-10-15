import type { Decorator } from "@storybook/nextjs-vite";
import { http, HttpResponse } from "msw";
import { createElement } from "react";
import type { Me } from "@/components/account";
import type { BrandInfo } from "@/components/brand-switcher";
import type { Source, Status } from "@/components/builder/use-status";
import { AccessProvider as Access } from "@/components/can";
import type { TreeProject } from "@/components/catalog";
import type { Release, VersionRow } from "@/lib/brand-head";
import type { CatalogItem, LineageEdge, LineageNode } from "@/lib/core/catalog";
import type { Update } from "@/lib/history";
import type { Rule } from "@/lib/rules";
import type { Scope } from "@/lib/scopes";

/**
 * The brands stories draw: Acme (a released brand with rules, a score and a portal), Northwind (a draft) and a
 * long-named one, with who is looking (`me`, an admin; `viewer`, read only), the catalog around them and its lineage.
 * Fixed dates and made-up names only: a story never depends on today.
 */

/** Fixed "now" for stories that show relative times: 15 October 2026, noon UTC. */
export const NOW = new Date("2026-10-15T12:00:00Z");
const at = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const acmeOrg = { id: "org_acme", slug: "acme", name: "Acme" };
export const project = { id: "prj_acme", slug: "acme", name: "Acme", organization: acmeOrg };

/** An organization admin with every feature, email on and Git, assistant and BrandHub configured. */
export const me: Me = {
  user: { id: "usr_ada", name: "Ada Lovelace", email: "ada@acme.test" },
  key: false,
  actor: "usr_ada",
  project,
  scope: "admin",
  orgScope: "admin",
  narrowed: false,
  email: true,
  narrow: { collections: {}, assets: {}, brands: {} },
  hidden: [],
  projects: [project, { id: "prj_northwind", slug: "northwind", name: "Northwind", organization: acmeOrg }],
  features: null,
  off: [],
  upgrade: null,
  billing: "https://app.artbucket.test/billing",
  git: "https://app.artbucket.test/github/connect",
  assistant: "https://app.artbucket.test/assistant",
  brandImport: null,
  hub: true,
  hubUrl: "https://hub.artbucket.test/acme",
  notice: null,
  feedback: { email: "hello@artbucket.test", version: "2.7.0" },
  joinable: null,
  auth: { signUp: true, setupToken: false, open: false, oidc: null, google: false, sso: false, anonymous: null, passwordReset: true, serverEmail: true, captcha: null, turnstile: null },
};

/** Someone with `scope` everywhere: `as("read")` is a viewer, who sees and may change nothing. */
export const as = (scope: Scope): Me => ({ ...me, user: { id: "usr_grace", name: "Grace Hopper", email: "grace@acme.test" }, actor: "usr_grace", scope, orgScope: scope });
export const viewer = as("read");
export const editor = as("write");

/** A decorator giving the story's tree who is looking: `decorators: [withMe(viewer)]`. Without one, nothing is allowed. */
export const withMe = (who: Me): Decorator =>
  function WithMe(Story) {
    return createElement(Access as React.FC<{ me: Me; children?: React.ReactNode }>, { me: who }, createElement(Story));
  };

export const acme: BrandInfo = { id: "brd_acme", slug: "acme", name: "Acme", default: true, rules: 9 };
export const northwind: BrandInfo = { id: "brd_northwind", slug: "northwind", name: "Northwind", default: false, rules: 0 };
export const longBrand: BrandInfo = {
  id: "brd_long",
  slug: "acme-international-holdings-partner-programme",
  name: "Acme International Holdings Partner Programme for Resellers",
  default: false,
  rules: 3,
  private: true,
};
export const brands: BrandInfo[] = [acme, northwind, longBrand];

const rule = (r: Omit<Rule, "brand" | "assets" | "usage" | "context"> & Partial<Pick<Rule, "assets" | "usage" | "context">>): Rule => ({
  brand: "acme",
  context: null,
  usage: null,
  assets: [],
  updatedAt: at(3),
  ...r,
});

/** Acme's rules: colors (with a dark context), type, a logo, voice. */
export const rules: Rule[] = [
  rule({ id: "rul_primary", key: "color.primary", type: "color", value: "#2f62ff", label: "Acme Blue", usage: "Buttons, links and the **one** thing to look at." }),
  rule({ id: "rul_primary_dark", key: "color.primary", context: "dark", type: "color", value: "#7d9bff", label: "Acme Blue" }),
  rule({ id: "rul_ink", key: "color.ink", type: "color", value: "#0b1020", label: "Ink" }),
  rule({ id: "rul_paper", key: "color.paper", type: "color", value: "#fbfaf7", label: "Paper" }),
  rule({ id: "rul_accent", key: "color.accent", type: "color", value: "#ff5b1f", label: "Signal" }),
  rule({ id: "rul_heading", key: "font.heading", type: "font", value: { family: "Inter", size: 32, weight: 700 }, label: "Headings" }),
  rule({ id: "rul_body", key: "font.body", type: "font", value: { family: "Inter", size: 16, weight: 400 }, label: "Body" }),
  rule({
    id: "rul_logo",
    key: "logo.primary",
    type: "text",
    value: "The Acme logo",
    label: "Logo",
    usage: "Keep clear space of the logo's height around it.",
    assets: [{ id: "ast_logo", rendition: null, title: "Acme logo", filename: "acme-logo.svg", mime: "image/svg+xml", width: 240, height: 80 }],
  }),
  rule({ id: "rul_voice", key: "voice.tone", type: "text", value: "Plain, warm and short. Say what it does, then stop.", label: "Tone of voice" }),
];

/** The latest release and the versions behind it. */
export const release: Release = { number: 12, publishedAt: at(2), note: "Signal orange for alerts, and the new logo.", rules: 9, pages: 6 };
export const versions: VersionRow[] = [
  { number: 13, publishedAt: null, note: null, rules: 9, pages: 6, updatedAt: at(0.2), createdAt: at(1) },
  { ...release, updatedAt: at(2), createdAt: at(3) },
  { number: 11, publishedAt: at(20), note: "Body type at 16px.", rules: 8, pages: 6, updatedAt: at(20), createdAt: at(21) },
];

/** GET .../updates: Acme's releases, newest first. */
export const updates: Update[] = [
  {
    version: 12,
    publishedAt: at(2),
    publishedBy: "Ada Lovelace",
    note: "Signal orange for alerts, and the new logo.",
    image: null,
    changes: { rules: { added: ["color.accent"], changed: ["logo.primary"], removed: [] }, pages: { added: [], changed: [{ slug: "logo", title: "Logo" }], removed: [] } },
  },
  {
    version: 11,
    publishedAt: at(20),
    publishedBy: "Grace Hopper",
    note: "Body type at 16px.",
    image: null,
    changes: { rules: { added: [], changed: ["font.body"], removed: [] }, pages: { added: [], changed: [], removed: [] } },
  },
  { version: 1, publishedAt: at(200), publishedBy: null, note: null, image: null, changes: { rules: { added: ["color.primary"], changed: [], removed: [] }, pages: { added: [], changed: [], removed: [] } } },
];

const steps = (done: Partial<Record<Status["steps"][number]["id"], boolean | null>>): Status["steps"] =>
  (
    [
      ["colors", "Add the brand's colors", 15],
      ["type", "Pick its typefaces", 15],
      ["logo", "Upload its logo", 20],
      ["voice", "Say how it sounds", 15],
      ["look", "Give the guidelines a look", 5],
      ["pages", "Write the guideline pages", 10],
      ["publish", "Release it", 15],
      ["portal", "Show it on a portal", 5],
    ] as const
  ).map(([id, title, points]) => ({ id, title, points, done: done[id] ?? false, detail: done[id] ? "Done" : `${title} so people and agents can use it.`, agent: `set_rules (${id})` }));

/** Acme: released, behind by one edit, on a public portal and BrandHub. */
export const status: Status = {
  steps: steps({ colors: true, type: true, logo: true, voice: true, look: true, pages: true, publish: true, portal: false }),
  done: 7,
  total: 8,
  score: 86,
  next: "portal",
  publish: "behind",
  live: 12,
  portals: [{ slug: "acme", name: "Acme brand portal", access: "public", url: "https://acme.artbucket.test" }],
  hub: { visibility: "public", url: "https://hub.artbucket.test/acme/acme", pulls: 1284, ref: "acme/acme", verified: "acme.test", terms: null, portal: { slug: "acme", name: "Acme brand portal" } },
  files: { downloadable: 3, shownOnly: [] },
};

/** Northwind: nothing yet. */
export const emptyStatus: Status = { steps: steps({}), done: 0, total: 8, score: 0, next: "colors", publish: "never", live: null, portals: null, hub: null };

/** Kept in a Git repository too, with an edit not yet there. */
export const source: Source = {
  source: { remote: "https://github.com/acme/brand.git", branch: "main", path: "brand", commit: "4f9c2a1", syncedAt: at(1), pending: true, files: 14 },
  connect: "https://app.artbucket.test/github/connect?brand=acme",
};

// The catalog: two projects, Acme's objects and one shared in from Northwind.
const ref = { id: project.id, slug: project.slug, name: project.name };
const item = (i: Partial<CatalogItem> & Pick<CatalogItem, "id" | "type" | "slug" | "name">): CatalogItem => ({
  description: null,
  status: "current",
  release: null,
  expires: null,
  expiring: false,
  private: false,
  tags: [],
  createdAt: new Date(at(90)),
  updatedAt: new Date(at(4)),
  project: ref,
  address: `acme/acme/${i.type}/${i.slug}`,
  parent: null,
  ...i,
});
const brandRef = { id: "brd_acme", type: "brand" as const, slug: "acme", name: "Acme" };

export const catalogItems: CatalogItem[] = [
  item({ id: "brd_acme", type: "brand", slug: "acme", name: "Acme", release: 12, description: "The Acme brand: colors, type, logo and voice." }),
  item({ id: "brd_northwind", type: "brand", slug: "northwind", name: "Northwind", status: "draft" }),
  item({ id: "col_press", type: "collection", slug: "press-kit", name: "Press kit", tags: ["press"] }),
  item({ id: "col_launch", type: "collection", slug: "spring-launch", name: "Spring launch 2026", status: "in_review" }),
  item({ id: "ast_logo", type: "asset", slug: "acme-logo", name: "acme-logo.svg", kind: "image", parent: brandRef }),
  item({ id: "ast_hero", type: "asset", slug: "hero", name: "hero-spring.jpg", kind: "image", expires: "2026-11-01", expiring: true }),
  item({ id: "ast_old_logo", type: "asset", slug: "acme-logo-2019", name: "acme-logo-2019.svg", kind: "image", status: "replaced" }),
  item({ id: "ast_film", type: "asset", slug: "launch-film", name: "launch-film.mp4", kind: "video" }),
  item({ id: "sit_portal", type: "site", slug: "acme", name: "Acme brand portal" }),
  item({ id: "rul_primary", type: "rule", slug: "color-primary", name: "Acme Blue", parent: brandRef }),
  item({ id: "pag_logo", type: "page", slug: "logo", name: "Logo", parent: brandRef }),
];

export const treeProjects: TreeProject[] = [
  { id: project.id, slug: project.slug, name: project.name, role: "admin", objects: catalogItems },
  {
    id: "prj_northwind",
    slug: "northwind",
    name: "Northwind",
    role: "read",
    objects: [
      item({ id: "col_nw", type: "collection", slug: "field-photos", name: "Field photos", project: { id: "prj_northwind", slug: "northwind", name: "Northwind" }, address: "acme/northwind/collection/field-photos" }),
    ],
  },
];

const node = (id: string, up: number, down: number, extra: Partial<LineageNode> = {}): LineageNode => ({ ...catalogItems.find((i) => i.id === id)!, up, down, ...extra });

/** GET /api/v1/catalog/{id}/lineage for the logo: replaced the 2019 one, a rule of Acme, in the press kit, shown on the portal. */
export const lineage: { root: string; nodes: LineageNode[]; edges: LineageEdge[]; unseen: number; impact: { things: number; projects: number; line: string } } = {
  root: "ast_logo",
  nodes: [
    node("ast_old_logo", 0, 1, { versions: 2 }),
    node("ast_logo", 1, 3, { license: "Owned", versions: 3 }),
    node("brd_acme", 1, 2),
    node("col_press", 1, 1),
    node("sit_portal", 2, 0),
  ],
  edges: [
    { from: "ast_old_logo", to: "ast_logo", kind: "replaced_by", via: null },
    { from: "ast_logo", to: "brd_acme", kind: "rule", via: "logo.primary" },
    { from: "ast_logo", to: "col_press", kind: "member", via: null },
    { from: "brd_acme", to: "sit_portal", kind: "offered", via: null },
    { from: "col_press", to: "sit_portal", kind: "offered", via: null },
  ],
  unseen: 1,
  impact: { things: 3, projects: 1, line: "Changing acme-logo.svg reaches 3 things downstream, in 1 project." },
};

// ---- the builder: the Rules tab and the rules sheet start from this (lib/builder-init.ts) ----

/** Acme's rules as the builder holds them (builder-init.ts viewRule): no previews, so no thumbnail asks for a file. */
export const viewRules: import("@/lib/site").ViewRule[] = rules.map((r) => ({
  key: r.key,
  context: r.context,
  type: r.type,
  label: r.label ?? null,
  value: r.value,
  usage: r.usage,
  spec: r.spec ?? null,
  assets: r.assets.map((a) => ({ ...a, title: a.title ?? null, filename: a.filename ?? "", mime: a.mime ?? "", size: 0, preview: false, supersededBy: null })),
}));

const navEntry = (slug: string, title: string, position: number, keys: string[]): import("@/lib/builder-ops").NavEntry => ({
  slug,
  title,
  position,
  hidden: false,
  parent: null,
  eyebrow: null,
  lede: null,
  cover: null,
  icon: null,
  audience: "everyone",
  tabs: false,
  layout: "book",
  aliases: [],
  updatedAt: at(3),
  keys,
});

/** Acme's guideline pages: what shows which rule ("On 1 page", "On no page"). */
export const acmeNav = [
  navEntry("overview", "Overview", 0, ["color.primary", "logo.primary"]),
  navEntry("color", "Color", 1, ["color.primary", "color.ink", "color.paper"]),
  navEntry("type", "Typography", 2, ["font.heading", "font.body"]),
];

/**
 * What useBuilder starts from (`useBuilder("acme", acmeInit())`): the pages, no page loaded yet, and `rs` as the
 * brand's rules. The theme is the builder's own to derive, from the rules.
 */
export const acmeInit = (rs = viewRules): import("@/lib/builder-ops").Init => ({
  nav: acmeNav,
  rules: rs,
  theme: {},
  view: {
    brand: { slug: "acme", name: "Acme" },
    version: null,
    context: null,
    contexts: [],
    lang: null,
    theme: { settings: {} } as import("@/lib/site").PageView["theme"],
    nav: [],
    page: null,
    locked: false,
    rules: rs,
    media: {},
    collections: {},
    signed: {},
    warnings: [],
    missing: [],
  },
});

// ---- people, automations, templates (Team, Automations, Templates, the consent screen) ----

const grantOf = (id: string, resource: "organization" | "project" | "collection", resourceId: string, label: string, scope: Scope) => ({
  id,
  resource,
  resourceId,
  projectId: resource === "organization" ? null : project.id,
  label,
  scope,
});

/** GET /api/v1/members: Ada (`me`, an admin), an editor, a viewer on one collection, and one invitation waiting. */
export const members: import("@/components/settings/access").Members = {
  data: [
    { id: "usr_ada", name: "Ada Lovelace", email: "ada@acme.test", grants: [grantOf("grt_ada", "organization", acmeOrg.id, "Acme", "admin")] },
    { id: "usr_grace", name: "Grace Hopper", email: "grace@acme.test", grants: [grantOf("grt_grace", "project", project.id, "Acme", "write")] },
    { id: "usr_linus", name: "Linus Nakamura", email: "linus@northwind.test", grants: [grantOf("grt_linus", "collection", "col_press", "Press kit", "read")] },
  ],
  invitations: [
    {
      id: "inv_sam",
      email: "sam@acme.test",
      resource: "project",
      resourceId: project.id,
      label: "Acme",
      scope: "propose",
      invitedBy: "Ada Lovelace",
      expiresAt: new Date(NOW.getTime() + 5 * 86_400_000).toISOString(),
      url: "https://app.artbucket.test/invite/k3x9q2",
    },
  ],
};

/** GET /api/v1/groups (lib/core/groups.ts): the brand team, editors on Acme, and legal, made by hand. */
export const groups = [
  {
    id: "grp_brand",
    name: "Brand team",
    source: null,
    createdAt: at(60),
    members: members.data.slice(0, 2).map(({ id, name, email }) => ({ id, name, email })),
    grants: [grantOf("grt_brand", "project", project.id, "Acme", "write")],
  },
  { id: "grp_legal", name: "Legal", source: null, createdAt: at(30), members: [{ id: "usr_linus", name: "Linus Nakamura", email: "linus@northwind.test" }], grants: [] },
];

const automation = (a: Partial<import("@/components/automations").AutomationRow> & Pick<import("@/components/automations").AutomationRow, "id" | "name" | "trigger">): import("@/components/automations").AutomationRow => ({
  brand: null,
  days: null,
  actions: [],
  times: null,
  kind: null,
  action: "email",
  emails: [],
  host: null,
  format: "json",
  enabled: true,
  last: null,
  ...a,
});

/** GET /api/v1/automations: a release email, a Slack webhook on shares, a license warning that is off, and a Fixes post that failed. */
export const automations: import("@/components/automations").AutomationRow[] = [
  automation({ id: "aut_release", name: "Tell the brand team", trigger: "brand.released", brand: "acme", emails: ["brand@acme.test"], last: { status: "delivered", at: at(2) } }),
  automation({ id: "aut_shares", name: "New share links to Slack", trigger: "governance", actions: ["share.created", "share.project"], action: "webhook", host: "hooks.slack.com", format: "slack", last: { status: "pending", at: at(0.1) } }),
  automation({ id: "aut_licenses", name: "Licenses ending, to legal", trigger: "asset.expiring", days: 30, emails: ["legal@acme.test"], enabled: false }),
  automation({ id: "aut_fixes", name: "New Fixes to Teams", trigger: "fix.opened", kind: "stale", action: "webhook", host: "acme.logic.azure.com", format: "teams", last: { status: "failed", at: at(1) } }),
];

/** GET /api/v1/brand/office/templates: one that follows the brand, one with colors and fonts set by hand, one that didn't read. */
export const ownTemplates: import("@/components/templates").OwnTemplate[] = [
  { id: "tpl_deck", filename: "acme-sales-deck.potx", title: "Sales deck", kind: "potx", app: "PowerPoint", error: null, themes: 1, colors: [], fonts: [], images: { total: 2, library: 2, updated: 1 }, follows: true },
  {
    id: "tpl_letter",
    filename: "acme-letterhead.dotx",
    title: null,
    kind: "dotx",
    app: "Word",
    error: null,
    themes: 1,
    colors: [{ value: "#ff0000", count: 3 }, { value: "#00a3e0", count: 1 }],
    fonts: [{ name: "Comic Sans MS", count: 2 }],
    images: { total: 3, library: 1, updated: 0 },
    follows: false,
  },
  { id: "tpl_sheet", filename: "budget.xltx", title: "Budget", kind: "xltx", app: "Excel", error: "It isn't an Office file Artbucket can read", themes: 0, colors: [], fonts: [], images: { total: 0, library: 0, updated: 0 }, follows: false },
];

/**
 * The files rules point at (`/a/{id}...`), for stories that draw a logo or a thumbnail: every one answers with the
 * product's own tile (public/icon.svg), so nothing 404s. `msw.use(assetFiles)` in a story's beforeEach.
 */
export const assetFiles = http.get("/a/*", async () => {
  const svg = await fetch("/icon.svg").then((r) => r.text());
  return new HttpResponse(svg, { headers: { "Content-Type": "image/svg+xml" } });
});

/**
 * What a story's saves sent, to assert: `const sent = recorder();`, `sent.reset()` in beforeEach, then
 * `msw.use(sent.on("put", "/api/v1/sso", data))` and `expect(sent.last("PUT")).toEqual({ path, body })`.
 * `status` 400 and up answers `data` as the API's error ({ code, message }).
 */
export function recorder() {
  const calls: { method: string; path: string; body: unknown }[] = [];
  return {
    calls,
    reset: () => void calls.splice(0),
    /** The last request of this method: its path with the query, and its JSON body (null for none). */
    last: (method: string) => {
      const c = calls.filter((x) => x.method === method).at(-1);
      return c && { path: c.path, body: c.body };
    },
    on: (method: "get" | "post" | "put" | "patch" | "delete", path: string, data: unknown = {}, status = 200) =>
      http[method](path, async ({ request }) => {
        const url = new URL(request.url);
        const text = await request.text();
        calls.push({ method: request.method, path: url.pathname + url.search, body: text ? JSON.parse(text) : null });
        return status < 400 ? HttpResponse.json({ data }) : HttpResponse.json({ error: data }, { status });
      }),
  };
}

/**
 * Now is NOW for the story, `Date.now()` and `new Date()` alike (relative times read either), with the clock
 * otherwise running: `beforeEach: freezeNow`, which returns the cleanup.
 */
export function freezeNow() {
  const Real = Date;
  const offset = NOW.getTime() - Real.now();
  class Frozen extends Real {
    constructor(...args: unknown[]) {
      if (args.length) super(...(args as [string]));
      else super(Real.now() + offset);
    }
    static now = () => Real.now() + offset;
  }
  globalThis.Date = Frozen as DateConstructor;
  return () => {
    globalThis.Date = Real;
  };
}
