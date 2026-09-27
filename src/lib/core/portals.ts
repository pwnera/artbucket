import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, brands, collectionAssets, collections, domains, grants, organizations, portalBrands, portalCollections, portalRequests, portals, users, workspaces, type PortalRequestStatus } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { hiddenIn, workspaceById, type Caller } from "@/lib/core/access";
import { deliverableSql, getAsset, notSuperseded } from "@/lib/core/assets";
import { listContexts, listRules } from "@/lib/core/brand";
import { brandOfWorkspace } from "@/lib/core/branding";
import { recordAudit } from "@/lib/core/audit";
import { getCollection } from "@/lib/core/collections";
import { AssetError } from "@/lib/core/errors";
import { appUrlFor, claimable, claimHost, forgetHosts, proveHost, releaseHost } from "@/lib/core/domains";
import { portalAccessEmail, portalRequestEmail, sendAs } from "@/lib/core/mail";
import { checkLimit } from "@/lib/core/usage";
import { accessIn, highest } from "@/lib/access";
import { env } from "@/lib/env";
import { can } from "@/lib/permissions";
import { challengeName, DEFAULT_PRESETS, downloadsFor, hostname, type PortalAccess, type PortalPreset, type PortalTheme } from "@/lib/portal";
import { hasPreview } from "@/lib/preview";
import { limiter } from "@/lib/rate";
import { prefixQuery } from "@/lib/search";
import { seal, unseal } from "@/lib/settings";
import { hashPassword, verifyPassword } from "@/lib/share";

/**
 * Brand portals: a curated, branded front door onto chosen collections, and
 * the guidelines of chosen brands, for press, partners and retailers. Only what may be used shows: approved,
 * unexpired, out of embargo, a stack's current version, the same rule as
 * /a/{id} (lib/lifecycle.ts). Images download as renditions made for a
 * purpose (lib/portal.ts), not raw originals.
 *
 * Who gets in follows share links: an end date, a password, and for a
 * `members` portal, people with access to the workspace. Anyone else may ask;
 * an admin's yes gives them a link of their own.
 *
 * Managing portals takes `portal.manage`; the portal page itself is a plain
 * client of GET /api/v1/portal/{slug}.
 */

type Row = typeof portals.$inferSelect;

const REQUEST_DAYS = 90;
const digest = (s: string) => createHash("sha256").update(s).digest("hex");

async function domainOf(portalId: string) {
  const [d] = await db.select().from(domains).where(eq(domains.portalId, portalId));
  return d ?? null;
}

/** Its own domain once verified; else /p/{slug}, on the organization's domain when it has one. */
const urlOf = async (p: Pick<Row, "slug" | "workspaceId">, d: { host: string; verifiedAt: Date | null } | null) => {
  if (d?.verifiedAt) return `${new URL(env.APP_URL).protocol}//${d.host}`;
  const ws = await workspaceById(p.workspaceId);
  return `${await appUrlFor(ws?.organizationId ?? null)}/p/${p.slug}`;
};

/** A portal's brands, in tab order. */
const brandsOf = (portalId: string) =>
  db
    .select({ id: brands.id, slug: brands.slug, name: brands.name })
    .from(portalBrands)
    .innerJoin(brands, eq(brands.id, portalBrands.brandId))
    .where(eq(portalBrands.portalId, portalId))
    .orderBy(asc(portalBrands.position));

async function present(p: Row) {
  const [cols, brandList, d, [{ pending }]] = await Promise.all([
    db
      .select({ id: collections.id, name: collections.name })
      .from(portalCollections)
      .innerJoin(collections, eq(collections.id, portalCollections.collectionId))
      .where(eq(portalCollections.portalId, p.id))
      .orderBy(asc(portalCollections.position)),
    brandsOf(p.id),
    domainOf(p.id),
    db.select({ pending: count() }).from(portalRequests).where(and(eq(portalRequests.portalId, p.id), eq(portalRequests.status, "pending"))),
  ]);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    intro: p.intro,
    access: p.access,
    password: !!p.passwordHash,
    expiresAt: p.expiresAt,
    expired: !!p.expiresAt && p.expiresAt <= new Date(),
    presets: p.presets,
    theme: p.theme,
    collections: cols,
    brands: brandList.map(({ slug, name }) => ({ slug, name })),
    domain: d && { host: d.host, verified: !!d.verifiedAt, record: { type: "TXT" as const, name: challengeName(d.host), value: d.token } },
    url: await urlOf(p, d),
    pending,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function mayManage(caller: Caller) {
  if (!can(caller, "portal.manage")) throw new AssetError("forbidden", "Portals take write on the workspace");
}

async function row(caller: Caller, id: string) {
  const [p] = await db.select().from(portals).where(and(eq(portals.id, id), eq(portals.workspaceId, caller.workspace.id)));
  return p ?? null;
}

export async function listPortals(caller: Caller) {
  mayManage(caller);
  const rows = await db.select().from(portals).where(eq(portals.workspaceId, caller.workspace.id)).orderBy(asc(portals.name));
  return Promise.all(rows.map(present));
}

export async function getPortal(caller: Caller, id: string) {
  mayManage(caller);
  const p = await row(caller, id);
  return p && present(p);
}

type Input = {
  name?: string;
  slug?: string;
  intro?: string | null;
  access?: PortalAccess;
  password?: string;
  expiresAt?: string | null;
  presets?: PortalPreset[];
  theme?: Partial<PortalTheme>;
  collections?: string[];
  brands?: string[];
  domain?: string | null;
};

/** Collections it may show: ones the caller could share themselves. */
async function checkCollections(caller: Caller, ids: string[]) {
  const unique = [...new Set(ids)];
  for (const id of unique) {
    const c = await getCollection(caller, id);
    if (!c) throw new AssetError("invalid", `No collection ${id}`);
    if (!can(caller, "collection.share", c)) throw new AssetError("forbidden", `Sharing ${c.name} takes write on it`);
  }
  return unique;
}

/** Brands it may publish, by slug: this workspace's. Publishing guidelines is managing portals; reading them is anyone's in the library. */
async function checkBrands(caller: Caller, slugs: string[]) {
  const unique = [...new Set(slugs)];
  if (!unique.length) return [];
  const found = await db.select({ id: brands.id, slug: brands.slug }).from(brands).where(and(eq(brands.workspaceId, caller.workspace.id), inArray(brands.slug, unique)));
  const missing = unique.filter((slug) => !found.some((f) => f.slug === slug));
  if (missing.length) throw new AssetError("invalid", `No brand ${missing.map((m) => `"${m}"`).join(", ")}`);
  return unique.map((slug) => found.find((f) => f.slug === slug)!.id);
}

/** Something to show: a portal with neither collections nor brands is an empty page. */
const showsSomething = (collectionIds: string[], brandIds: string[]) => {
  if (!collectionIds.length && !brandIds.length) throw new AssetError("invalid", "A portal shows at least one collection or brand");
};

async function checkTheme(caller: Caller, theme: Partial<PortalTheme>, was: PortalTheme) {
  const next = { ...was, ...theme };
  if (theme.logo) {
    const a = await getAsset(caller, theme.logo);
    if (!a || !a.mime.startsWith("image/")) throw new AssetError("invalid", "The logo is an image asset of this workspace");
  }
  return next;
}

async function slugFree(slug: string, except?: string) {
  const [taken] = await db.select({ id: portals.id }).from(portals).where(eq(portals.slug, slug));
  if (taken && taken.id !== except) throw new AssetError("conflict", `/p/${slug} is taken: pick another address`);
}

/** Point a host name at the portal, or none. A new name needs proving again. */
async function setDomain(caller: Caller, portalId: string, raw: string | null) {
  const current = await domainOf(portalId);
  if (raw !== null && current?.host === hostname(raw)) return;
  // Checked before the old one goes, so a refused name leaves the portal where it was.
  if (raw !== null) await claimable(raw);
  if (current) await releaseHost(current.host);
  if (raw !== null) await claimHost(caller.workspace.organizationId, portalId, raw);
}

async function setCollections(portalId: string, ids: string[]) {
  await db.delete(portalCollections).where(eq(portalCollections.portalId, portalId));
  if (ids.length) await db.insert(portalCollections).values(ids.map((collectionId, position) => ({ portalId, collectionId, position })));
}

async function setBrands(portalId: string, ids: string[]) {
  await db.delete(portalBrands).where(eq(portalBrands.portalId, portalId));
  if (ids.length) await db.insert(portalBrands).values(ids.map((brandId, position) => ({ portalId, brandId, position })));
}

function expiry(raw: string | null | undefined) {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const d = new Date(raw);
  if (d <= new Date()) throw new AssetError("invalid", "expiresAt is in the past");
  return d;
}

export async function createPortal(caller: Caller, input: Input & { name: string; slug: string }) {
  mayManage(caller);
  await checkLimit(caller.workspace.organizationId, "shares");
  const access = input.access ?? "public";
  if (access === "password" && !input.password) throw new AssetError("invalid", "A password portal needs a password");
  await slugFree(input.slug);
  const ids = await checkCollections(caller, input.collections ?? []);
  const brandIds = await checkBrands(caller, input.brands ?? []);
  showsSomething(ids, brandIds);
  const theme = await checkTheme(caller, input.theme ?? {}, { logo: null, accent: null, background: null });
  const [p] = await db
    .insert(portals)
    .values({
      workspaceId: caller.workspace.id,
      slug: input.slug,
      name: input.name,
      intro: input.intro || null,
      access,
      passwordHash: input.password ? await hashPassword(input.password) : null,
      expiresAt: expiry(input.expiresAt) ?? null,
      presets: input.presets ?? DEFAULT_PRESETS,
      theme,
      createdBy: caller.actor,
    })
    .returning();
  await setCollections(p.id, ids);
  await setBrands(p.id, brandIds);
  if (input.domain) await setDomain(caller, p.id, input.domain);
  await recordAudit(caller, "portal.created", p.name, { access, slug: p.slug });
  return present(p);
}

export async function updatePortal(caller: Caller, id: string, input: Input) {
  mayManage(caller);
  const p = await row(caller, id);
  if (!p) return null;
  if (input.slug && input.slug !== p.slug) await slugFree(input.slug, p.id);
  const access = input.access ?? p.access;
  const passwordHash = input.password ? await hashPassword(input.password) : p.passwordHash;
  if (access === "password" && !passwordHash) throw new AssetError("invalid", "A password portal needs a password");
  const ids = input.collections && (await checkCollections(caller, input.collections));
  const brandIds = input.brands && (await checkBrands(caller, input.brands));
  if (ids || brandIds) {
    const [cols, bs] = await Promise.all([
      ids ?? db.select({ id: portalCollections.collectionId }).from(portalCollections).where(eq(portalCollections.portalId, p.id)).then((r) => r.map((x) => x.id)),
      brandIds ?? brandsOf(p.id).then((r) => r.map((x) => x.id)),
    ]);
    showsSomething(cols, bs);
  }
  const theme = input.theme ? await checkTheme(caller, input.theme, p.theme) : p.theme;
  const [next] = await db
    .update(portals)
    .set({
      name: input.name ?? p.name,
      slug: input.slug ?? p.slug,
      intro: input.intro === undefined ? p.intro : input.intro || null,
      access,
      passwordHash,
      expiresAt: expiry(input.expiresAt) === undefined ? p.expiresAt : expiry(input.expiresAt),
      presets: input.presets ?? p.presets,
      theme,
      updatedAt: new Date(),
    })
    .where(eq(portals.id, p.id))
    .returning();
  if (ids) await setCollections(p.id, ids);
  if (brandIds) await setBrands(p.id, brandIds);
  if (input.domain !== undefined) await setDomain(caller, p.id, input.domain);
  forgetHosts();
  const changed = Object.keys(input).filter((k) => k !== "password" || input.password);
  await recordAudit(caller, "portal.updated", next.name, { changed });
  return present(next);
}

export async function deletePortal(caller: Caller, id: string) {
  mayManage(caller);
  const p = await row(caller, id);
  if (!p) return false;
  await db.delete(portals).where(eq(portals.id, p.id));
  forgetHosts();
  await recordAudit(caller, "portal.deleted", p.name, { slug: p.slug });
  return true;
}

// ---- domains --------------------------------------------------------------------

/**
 * Look for the portal's TXT record now. Verified, the domain serves the
 * portal, and a TLS certificate may be issued for it.
 */
export async function verifyDomain(caller: Caller, portalId: string) {
  mayManage(caller);
  const p = await row(caller, portalId);
  if (!p) return null;
  const d = await domainOf(p.id);
  if (!d) throw new AssetError("invalid", "This portal has no domain");
  await proveHost(caller, d, { portal: p.slug });
  return present(p);
}

// ---- the visitor's side -----------------------------------------------------------

/** Wrong passwords per portal, and requests per address: as share links (lib/core/shares.ts). */
const guesses = limiter(10, 10 * 60_000);
const asks = limiter(5, 60 * 60_000);
const floods = limiter(30, 60 * 60_000);

type Pass = { password?: string | null; key?: string | null; headers?: Headers };

const logoUrl = async (theme: PortalTheme) => {
  if (!theme.logo) return null;
  const [a] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.id, theme.logo), deliverableSql));
  return a ? `/a/${a.id}/h_128,f_webp` : null;
};

/** The portal's own look over its organization's brand (lib/core/branding.ts): one source of truth, overridden here. */
const shownTheme = async (p: Row) => {
  const brand = await brandOfWorkspace(p.workspaceId);
  return {
    logo: (await logoUrl(p.theme)) ?? brand.logo,
    accent: p.theme.accent ?? brand.accent,
    background: p.theme.background,
    icon: brand.icon,
    product: brand.name,
  };
};

/** Someone signed in who may read the portal's workspace. */
async function isMember(p: Row, headers: Headers | undefined) {
  if (!headers) return false;
  const session = await auth.api.getSession({ headers }).catch(() => null);
  if (!session) return false;
  const ws = await workspaceById(p.workspaceId);
  if (!ws) return false;
  const mine = await db.select().from(grants).where(eq(grants.userId, session.user.id));
  const access = accessIn(mine, ws, await hiddenIn(ws.id));
  const orgScope = highest(...mine.filter((g) => g.resource === "organization" && g.resourceId === ws.organizationId).map((g) => g.scope));
  return can({ ...access, orgScope }, "library.read");
}

async function keyValid(p: Row, key: string | null | undefined) {
  if (!key) return false;
  const [r] = await db
    .select({ id: portalRequests.id })
    .from(portalRequests)
    .where(
      and(
        eq(portalRequests.portalId, p.id),
        eq(portalRequests.keyHash, digest(key)),
        eq(portalRequests.status, "approved"),
        sql`(${portalRequests.expiresAt} is null or ${portalRequests.expiresAt} > now())`,
      ),
    );
  return !!r;
}

/**
 * The portal a slug names, if this visitor may open it: 404 for none, 410
 * once it closed, 401 (`password`) naming how to get in otherwise.
 */
async function open(slug: string, pass: Pass) {
  const [p] = await db.select().from(portals).where(eq(portals.slug, slug));
  if (!p) throw new AssetError("not_found", "There is no portal here");
  if (p.expiresAt && p.expiresAt <= new Date()) throw new AssetError("gone", "This portal has closed");
  if (p.access === "public" || (await keyValid(p, pass.key))) return p;
  if (p.access === "password" && pass.password) {
    const wait = guesses.wait(p.id);
    if (wait) throw new AssetError("rate_limited", `Too many wrong passwords. Try again in ${Math.ceil(wait / 60)} min`);
    if (p.passwordHash && (await verifyPassword(pass.password, p.passwordHash))) return p;
    guesses.hit(p.id);
  }
  if (p.access === "members" && (await isMember(p, pass.headers))) return p;
  const detail = { name: p.name, access: p.access, theme: await shownTheme(p) };
  throw new AssetError(
    "password",
    p.access === "password"
      ? pass.password
        ? "That password isn't right"
        : "This portal needs a password"
      : "This portal is for members: sign in, or ask for access",
    detail,
  );
}

const shown = (a: typeof assets.$inferSelect, presets: PortalPreset[]) => {
  const m = a.metadata ?? {};
  const still = hasPreview(a);
  return {
    id: a.id,
    filename: a.filename,
    title: m.title ?? null,
    description: m.description ?? null,
    creator: m.creator ?? null,
    copyright: m.copyright ?? null,
    mime: a.mime,
    size: a.size,
    width: a.width,
    height: a.height,
    // On this host, not APP_URL: a portal on its own domain loads everything from there.
    thumbnail: still ? `/a/${a.id}/w_640,f_webp` : null,
    preview: still ? `/a/${a.id}/w_1600,f_webp` : null,
    downloads: downloadsFor(a, presets, ""),
  };
};

/**
 * What a portal shows: itself, themed, its collections with how many usable
 * assets each has, and a page of those assets, narrowed by `q` and
 * `collection`.
 */
export async function viewPortal(
  slug: string,
  pass: Pass,
  { q, collection, limit = 60, offset = 0 }: { q?: string | null; collection?: string | null; limit?: number; offset?: number } = {},
) {
  const p = await open(slug, pass);
  const [org] = await db
    .select({ name: organizations.name })
    .from(workspaces)
    .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
    .where(eq(workspaces.id, p.workspaceId));
  const usable = and(deliverableSql, notSuperseded);
  const cols = await db
    .select({
      id: collections.id,
      name: collections.name,
      count: sql<number>`(select count(*)::int from ${collectionAssets} ca join ${assets} on ${assets.id} = ca.asset_id where ca.collection_id = ${collections.id} and ${usable})`,
    })
    .from(portalCollections)
    .innerJoin(collections, eq(collections.id, portalCollections.collectionId))
    .where(eq(portalCollections.portalId, p.id))
    .orderBy(asc(portalCollections.position));
  const ids = collection ? cols.filter((c) => c.id === collection).map((c) => c.id) : cols.map((c) => c.id);
  if (collection && !ids.length) throw new AssetError("not_found", "That collection isn't in this portal");
  const tsq = q ? prefixQuery(q) : null;
  const where = and(
    usable,
    ids.length
      ? sql`exists (select 1 from ${collectionAssets} ca where ca.asset_id = ${assets.id} and ${inArray(sql`ca.collection_id`, ids)})`
      : sql`false`,
    tsq ? sql`${assets.search} @@ to_tsquery('simple', ${tsq})` : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(assets)
      .where(where)
      .orderBy(desc(assets.createdAt))
      .limit(Math.min(Math.max(limit, 1), 200))
      .offset(Math.max(offset, 0)),
    db.select({ total: count() }).from(assets).where(where),
  ]);
  return {
    portal: {
      slug: p.slug,
      name: p.name,
      intro: p.intro,
      organization: org?.name ?? "",
      access: p.access,
      expiresAt: p.expiresAt,
      theme: await shownTheme(p),
      collections: cols,
      brands: (await brandsOf(p.id)).map(({ slug, name }) => ({ slug, name })),
    },
    data: rows.map((a) => shown(a, p.presets)),
    total,
  };
}

/**
 * One of a portal's brands, as its guidelines page reads (lib/core/brand.ts
 * listRules), under the same door as the portal. A rule's assets show only
 * when they may be used (lib/lifecycle.ts): a draft logo stays in the library.
 */
export async function viewPortalBrand(slug: string, pass: Pass, brandSlug: string, { context }: { context?: string | null } = {}) {
  const p = await open(slug, pass);
  const brand = (await brandsOf(p.id)).find((b) => b.slug === brandSlug);
  if (!brand) throw new AssetError("not_found", "That brand isn't in this portal");
  const [rules, contexts] = await Promise.all([listRules(p.workspaceId, { brand: brand.slug, context: context ?? undefined }), listContexts(p.workspaceId, brand.slug)]);
  const ids = [...new Set(rules.flatMap((r) => r.assets.map((a) => a.id)))];
  const usable = ids.length
    ? new Set((await db.select({ id: assets.id }).from(assets).where(and(inArray(assets.id, ids), deliverableSql))).map((a) => a.id))
    : new Set<string>();
  return {
    brand: { slug: brand.slug, name: brand.name },
    data: rules.map((r) => ({ ...r, assets: r.assets.filter((a) => usable.has(a.id)) })),
    contexts,
  };
}

/** Admins who hear about a request: the workspace's and the organization's. */
async function adminsOf(p: Row) {
  const ws = await workspaceById(p.workspaceId);
  if (!ws) return [];
  const rows = await db
    .selectDistinct({ email: users.email })
    .from(grants)
    .innerJoin(users, eq(users.id, grants.userId))
    .where(
      and(
        eq(grants.scope, "admin"),
        sql`((${grants.resource} = 'organization' and ${grants.resourceId} = ${ws.organizationId}) or (${grants.resource} = 'workspace' and ${grants.resourceId} = ${ws.id}))`,
      ),
    );
  return rows.map((r) => r.email);
}

/**
 * Ask into a portal that isn't public. It always answers the same, so it
 * can't be used to learn who has asked before; a second ask while one waits
 * is the same ask.
 */
export async function requestAccess(slug: string, input: { email: string; name?: string; note?: string }, ip: string | null) {
  const [p] = await db.select().from(portals).where(eq(portals.slug, slug));
  if (!p) throw new AssetError("not_found", "There is no portal here");
  if (p.access === "public") throw new AssetError("invalid", "This portal is open: no need to ask");
  if (p.expiresAt && p.expiresAt <= new Date()) throw new AssetError("gone", "This portal has closed");
  // Five an hour from one address, thirty an hour in all: enough for real people, not for a flood of email to admins.
  const wait = asks.hit(`${ip ?? "?"}:${p.id}`) || floods.hit(p.id);
  if (wait) throw new AssetError("rate_limited", `Too many requests. Try again in ${Math.ceil(wait / 60)} min`);
  const email = input.email.trim().toLowerCase();
  const [waiting] = await db
    .select({ id: portalRequests.id })
    .from(portalRequests)
    .where(and(eq(portalRequests.portalId, p.id), eq(portalRequests.email, email), eq(portalRequests.status, "pending")));
  if (!waiting) {
    await db.insert(portalRequests).values({ portalId: p.id, email, name: input.name || null, note: input.note || null });
    const ws = await workspaceById(p.workspaceId);
    const manage = `${await appUrlFor(ws?.organizationId ?? null)}/portals?open=${p.id}`;
    for (const to of await adminsOf(p)) {
      await sendAs(ws?.organizationId ?? null, portalRequestEmail(to, { portal: p.name, who: input.name ? `${input.name} (${email})` : email, note: input.note ?? null, url: manage }));
    }
  }
  return { received: true };
}

const presentRequest = async (p: Row, d: { host: string; verifiedAt: Date | null } | null, r: typeof portalRequests.$inferSelect) => {
  const key = r.status === "approved" && r.keySealed ? unseal(r.keySealed, env.BETTER_AUTH_SECRET) : null;
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    note: r.note,
    status: r.status,
    expiresAt: r.expiresAt,
    decidedBy: r.decidedBy,
    decidedAt: r.decidedAt,
    createdAt: r.createdAt,
    url: key ? `${await urlOf(p, d)}?key=${key}` : null,
  };
};

export async function listRequests(caller: Caller, portalId: string) {
  mayManage(caller);
  const p = await row(caller, portalId);
  if (!p) return null;
  const [rows, d] = await Promise.all([
    db.select().from(portalRequests).where(eq(portalRequests.portalId, p.id)).orderBy(desc(portalRequests.createdAt)).limit(200),
    domainOf(p.id),
  ]);
  return Promise.all(rows.map((r) => presentRequest(p, d, r)));
}

/** Say yes or no. Yes makes them a link of their own, emailed when email works, and shown to copy either way. */
export async function decideRequest(caller: Caller, portalId: string, requestId: string, status: Exclude<PortalRequestStatus, "pending">) {
  mayManage(caller);
  const p = await row(caller, portalId);
  if (!p) return null;
  const [r] = await db.select().from(portalRequests).where(and(eq(portalRequests.id, requestId), eq(portalRequests.portalId, p.id)));
  if (!r) return null;
  const key = status === "approved" ? randomBytes(24).toString("base64url") : null;
  const until = new Date(Math.min(Date.now() + REQUEST_DAYS * 86_400_000, p.expiresAt?.getTime() ?? Infinity));
  const [next] = await db
    .update(portalRequests)
    .set({
      status,
      keyHash: key && digest(key),
      keySealed: key && seal(key, env.BETTER_AUTH_SECRET),
      expiresAt: key ? until : null,
      decidedBy: caller.actor,
      decidedAt: new Date(),
    })
    .where(eq(portalRequests.id, r.id))
    .returning();
  const out = await presentRequest(p, await domainOf(p.id), next);
  let emailed = false;
  if (out.url) {
    const sent = await sendAs(caller.workspace.organizationId, portalAccessEmail(r.email, { portal: p.name, organization: caller.workspace.organization.name, url: out.url, until }));
    emailed = sent.sent;
  }
  await recordAudit(caller, status === "approved" ? "portal.request_approved" : "portal.request_denied", r.email, { portal: p.name });
  return { data: out, emailed };
}

/** Take back someone's access, or forget their request. */
export async function deleteRequest(caller: Caller, portalId: string, requestId: string) {
  mayManage(caller);
  const p = await row(caller, portalId);
  if (!p) return false;
  const gone = await db.delete(portalRequests).where(and(eq(portalRequests.id, requestId), eq(portalRequests.portalId, p.id))).returning({ email: portalRequests.email });
  if (gone.length) await recordAudit(caller, "portal.request_removed", gone[0].email, { portal: p.name });
  return gone.length > 0;
}
