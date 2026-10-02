import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, inArray, max, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assets,
  brandRules,
  brands,
  brandVersions,
  collectionAssets,
  collections,
  domains,
  grants,
  organizations,
  portalBrands,
  portalAliases,
  portalCollections,
  portalRequests,
  portals,
  users,
  workspaces,
  type PortalRequestStatus,
} from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { hiddenIn, workspaceById, type Caller } from "@/lib/core/access";
import { deliverableSql, getAsset, notSuperseded } from "@/lib/core/assets";
import { listUpdates } from "@/lib/core/brand";
import { brandOfWorkspace } from "@/lib/core/branding";
import { recordAudit } from "@/lib/core/audit";
import { getCollection } from "@/lib/core/collections";
import { AssetError } from "@/lib/core/errors";
import { record, recordSearch } from "@/lib/core/events";
import { appUrlFor, assignable, assignHost, cnameFor, forgetHosts, portalNamed, portalUrl, proveHost } from "@/lib/core/domains";
import { portalAccessEmail, portalRequestEmail, sendAs } from "@/lib/core/mail";
import { checkLimit, limitsOf } from "@/lib/core/usage";
import { accessIn, highest } from "@/lib/access";
import { env } from "@/lib/env";
import { type Action, can } from "@/lib/permissions";
import { brandLook, challengeName, DEFAULT_PRESETS, PORTAL_SLUG, PortalSite, subdomainRefusal, wornTheme, type PortalAccess, type PortalPreset, type PortalTheme } from "@/lib/portal";
import { limiter } from "@/lib/rate";
import { prefixQuery } from "@/lib/search";
import { seal, unseal } from "@/lib/settings";
import { assetIdsIn, signUrlsIn, withSignature } from "@/lib/signed";
import { longSig, pagePath, pageSig } from "@/lib/core/signing";
import { collectionItems, presentAsset } from "@/lib/core/section-assets";
import { publishedSource, viewLook, viewPage, type BrandSource } from "@/lib/core/page-view";
import { readablePages } from "@/lib/page-view";
import { assetRefs, AUDIENCES, isLive, LANG, liveProps, type Audience, type RequestKind } from "@/lib/pages";
import { hasPreview } from "@/lib/preview";
import { isDownloadable, rightsReasons, today, type Use } from "@/lib/rights";
import { resolve, ruleContext, specAssets } from "@/lib/rules";
import { hashPassword, verifyPassword } from "@/lib/share";
import { canonicalPath, resolvePath, searchSite } from "@/lib/site";

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
 * Visitors read the brands' latest publish, never the draft (D15): a brand
 * never published shows nothing. Who they are sets what they may open (D19):
 * everyone on a public portal, partners with its password or an approved
 * request's key, members signed in to the workspace. Pages and sections above
 * them are left out before anything is signed (lib/page-view.ts planView).
 *
 * Managing portals takes `portal.manage`; the portal page itself is a plain
 * client of GET /api/v1/portal/{slug} and its site, search and updates.
 */

type Row = typeof portals.$inferSelect;

const REQUEST_DAYS = 90;
/** Old addresses a portal keeps after renames: the latest, so renaming can't hold names without end. */
const ALIASES = 5;
const digest = (s: string) => createHash("sha256").update(s).digest("hex");

async function domainOf(portalId: string) {
  const [d] = await db.select().from(domains).where(eq(domains.portalId, portalId));
  return d ?? null;
}


/**
 * A portal's brands, in tab order, each with its latest publish. `shown`:
 * visitors see it, its publish, or as it stands for a brand with no history
 * at all (D15); a brand with history and no publish is left out.
 */
async function brandsOf(portalId: string) {
  const rows = await db
    .select({ id: brands.id, slug: brands.slug, name: brands.name })
    .from(portalBrands)
    .innerJoin(brands, eq(brands.id, portalBrands.brandId))
    .where(eq(portalBrands.portalId, portalId))
    .orderBy(asc(portalBrands.position));
  const versions = rows.length
    ? await db
        .select({ brandId: brandVersions.brandId, publishedAt: max(brandVersions.publishedAt) })
        .from(brandVersions)
        .where(inArray(brandVersions.brandId, rows.map((r) => r.id)))
        .groupBy(brandVersions.brandId)
    : [];
  const published = new Map(versions.map((v) => [v.brandId, v.publishedAt]));
  return rows.map((r) => ({ ...r, publishedAt: published.get(r.id) ?? null, shown: !published.has(r.id) || !!published.get(r.id) }));
}

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
    site: p.site,
    collections: cols,
    brands: brandList.map(({ slug, name, publishedAt }) => ({ slug, name, publishedAt })),
    domain: d && { host: d.host, verified: !!d.verifiedAt, record: { type: "TXT" as const, name: challengeName(d.host), value: d.token }, cname: cnameFor(d.host) },
    url: await portalUrl(p, d),
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
  site?: PortalSite;
};

/** Search engines list a public portal only: behind a door there is nothing for them to read. Visitors' copy masks it too (siteOf). */
function checkSite(site: PortalSite, access: PortalAccess) {
  if (site.listed && access !== "public") throw new AssetError("invalid", "site.listed: only a public portal can be listed");
  return site;
}

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

/**
 * A new address: free, and with PORTAL_DOMAIN, one that may be a subdomain when
 * it would answer at one (`subdomain`: no domain of its own, not members). One
 * already held keeps working; a refused one answers at /p/{slug} only.
 */
async function slugFree(slug: string, except?: string, subdomain = true) {
  const refused = env.PORTAL_DOMAIN && subdomain && subdomainRefusal(slug);
  if (refused) throw new AssetError("invalid", refused);
  const named = await portalNamed(slug);
  if (named && named.p.id !== except) throw new AssetError("conflict", `${slug} is taken: pick another address`);
}

/** GET /api/v1/portals/address: whether a portal (`except`, when renaming one) may take this address, why not, and where it would answer. */
export async function portalAddress(caller: Caller, slug: string, except?: string, subdomain = true) {
  mayManage(caller);
  if (!PORTAL_SLUG.test(slug)) throw new AssetError("invalid", "An address is lowercase letters, digits and dashes, e.g. press-kit");
  let reason: string | null = null;
  try {
    await slugFree(slug, except, subdomain);
  } catch (err) {
    if (!(err instanceof AssetError)) throw err;
    reason = err.message;
  }
  return { slug, available: !reason, reason, url: await portalUrl({ slug, workspaceId: caller.workspace.id, access: "public" }, null) };
}

/** Serve the portal at one of the organization's verified domains (Settings, Domains), or none. */
const setDomain = (caller: Caller, portalId: string, raw: string | null) => assignHost(caller.workspace.organizationId, portalId, raw);

/**
 * Replace what a portal shows. Two changes at once would both delete, then
 * both insert, and the portal would show both lists: they take turns on the
 * portal's row, and the last one stands whole.
 */
async function setShown(portalId: string, { collections: cols, brands: bs }: { collections?: string[]; brands?: string[] }) {
  await db.transaction(async (tx) => {
    await tx.select({ id: portals.id }).from(portals).where(eq(portals.id, portalId)).for("no key update");
    if (cols) {
      await tx.delete(portalCollections).where(eq(portalCollections.portalId, portalId));
      if (cols.length) await tx.insert(portalCollections).values(cols.map((collectionId, position) => ({ portalId, collectionId, position })));
    }
    if (bs) {
      await tx.delete(portalBrands).where(eq(portalBrands.portalId, portalId));
      if (bs.length) await tx.insert(portalBrands).values(bs.map((brandId, position) => ({ portalId, brandId, position })));
    }
  });
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
  await slugFree(input.slug, undefined, !input.domain && access !== "members");
  const ids = await checkCollections(caller, input.collections ?? []);
  const brandIds = await checkBrands(caller, input.brands ?? []);
  showsSomething(ids, brandIds);
  const theme = await checkTheme(caller, input.theme ?? {}, { logo: null, accent: null, background: null });
  const site = checkSite(input.site ?? {}, access);
  // Refused before anything is made, so a wrong domain leaves no half-made portal.
  if (input.domain) await assignable(caller.workspace.organizationId, null, input.domain);
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
      site,
      createdBy: caller.actor,
    })
    .returning();
  await setShown(p.id, { collections: ids, brands: brandIds });
  if (input.domain) await setDomain(caller, p.id, input.domain);
  await recordAudit(caller, "portal.created", p.name, { access, slug: p.slug });
  return present(p);
}

export async function updatePortal(caller: Caller, id: string, input: Input) {
  mayManage(caller);
  const p = await row(caller, id);
  if (!p) return null;
  const access = input.access ?? p.access;
  if (input.slug && input.slug !== p.slug) {
    const own = input.domain !== undefined ? input.domain : (await domainOf(p.id))?.host;
    await slugFree(input.slug, p.id, !own && access !== "members");
  }
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
  const site = input.site ? checkSite(input.site, access) : p.site;
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
      site,
      updatedAt: new Date(),
    })
    .where(eq(portals.id, p.id))
    .returning();
  // Deleted since it was read.
  if (!next) return null;
  if (ids || brandIds) await setShown(p.id, { collections: ids, brands: brandIds });
  if (next.slug !== p.slug) {
    // The old address keeps leading here, and stays this portal's; renaming back takes one up again.
    await db.insert(portalAliases).values({ slug: p.slug, portalId: p.id }).onConflictDoNothing();
    await db.delete(portalAliases).where(eq(portalAliases.slug, next.slug));
    const kept = db.select({ slug: portalAliases.slug }).from(portalAliases).where(eq(portalAliases.portalId, p.id)).orderBy(desc(portalAliases.createdAt)).limit(ALIASES);
    await db.delete(portalAliases).where(and(eq(portalAliases.portalId, p.id), notInArray(portalAliases.slug, kept)));
  }
  if (input.domain !== undefined) await setDomain(caller, p.id, input.domain);
  forgetHosts();
  const changed = Object.keys(input).filter((k) => k !== "password" || input.password);
  await recordAudit(caller, "portal.updated", next.name, { changed });
  return present(next);
}

/**
 * Take a portal offline now: it closes as a portal past its date does, and
 * visitors are told so. Reopening is a change of expiresAt to null (or a later
 * day), so nothing about it is lost meanwhile.
 */
export async function closePortal(caller: Caller, id: string) {
  mayManage(caller);
  const p = await row(caller, id);
  if (!p) return null;
  const [next] = await db.update(portals).set({ expiresAt: new Date(), updatedAt: new Date() }).where(eq(portals.id, p.id)).returning();
  if (!next) return null;
  forgetHosts();
  await recordAudit(caller, "portal.updated", next.name, { changed: ["expiresAt"] });
  return present(next);
}

export async function deletePortal(caller: Caller, id: string) {
  mayManage(caller);
  const p = await row(caller, id);
  if (!p) return false;
  const gone = await db.delete(portals).where(eq(portals.id, p.id)).returning({ id: portals.id });
  if (!gone.length) return false;
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

export type Pass = { password?: string | null; key?: string | null; headers?: Headers };

/** How a visitor's request says who they are: the password and an approved request's key in headers, and a member's session. */
export const passOf = (req: Request): Pass => ({ password: req.headers.get("x-portal-password"), key: req.headers.get("x-portal-key"), headers: req.headers });

/** The logo, signed as the organization's (lib/core/branding.ts): it shows at the door too, to anyone. */
const logoUrl = async (ws: string, id: string | null) => {
  if (!id) return null;
  const [a] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.id, id), eq(assets.workspaceId, ws), deliverableSql));
  return a ? withSignature(`/a/${a.id}/h_128,f_webp`, longSig(a.id, 30)) : null;
};

/**
 * The logo and accent a portal showing this brand wears where it sets none
 * (lib/portal.ts brandLook): from the release its visitors read, and only
 * files that may be shown. GET /api/v1/portals/look shows it in the form.
 */
export async function brandLookOf(ws: string, slug: string) {
  const src = await publishedSource(ws, slug);
  const ids = [...new Set(src?.rules.flatMap((r) => r.assets.map((a) => a.id)) ?? [])];
  const usable = ids.length
    ? new Map(
        (await db.select({ id: assets.id, mime: assets.mime }).from(assets).where(and(inArray(assets.id, ids), eq(assets.workspaceId, ws), deliverableSql))).map((a) => [a.id, a.mime]),
      )
    : new Map<string, string>();
  return brandLook((src?.rules ?? []).map((r) => ({ ...r, assets: r.assets.flatMap((a) => (usable.has(a.id) ? [{ id: a.id, mime: usable.get(a.id)! }] : [])) })), src?.theme.logo);
}

/**
 * What the portal wears (lib/portal.ts wornTheme): its own logo and accent,
 * else its first brand's, else its organization's (lib/core/branding.ts).
 */
const shownTheme = async (p: Row) => {
  const [org, first] = await Promise.all([brandOfWorkspace(p.workspaceId), brandsOf(p.id).then((l) => l.find((b) => b.shown))]);
  const worn = wornTheme(p.theme, first ? await brandLookOf(p.workspaceId, first.slug) : null);
  return {
    logo: (await logoUrl(p.workspaceId, worn.logo)) ?? org.logo,
    accent: worn.accent ?? org.accent,
    background: p.theme.background,
    icon: org.icon,
    product: org.name,
  };
};

/**
 * Whether its pages carry "Powered by Artbucket" (PRD): unless its
 * organization's plan has white-label, the branding feature. Not on a
 * members' portal: whoever reads it is in the app already.
 */
async function madeWith(p: Row) {
  if (p.access === "members") return false;
  const ws = await workspaceById(p.workspaceId);
  const features = ws && (await limitsOf(ws.organizationId)).features;
  return !!features && !features.includes("branding");
}

/** Someone signed in who may read the portal's workspace. */
const isMember = (p: Row, headers: Headers | undefined) => readsWorkspace(p.workspaceId, headers);

/**
 * Who is signed in, and a check of what they may do in a workspace: read it
 * (a portal's members, BrandHub's private brands), or edit its brands (the
 * floating Edit on BrandHub and portals; never in a read-only organization).
 * Null when nobody is.
 */
export async function reader(headers: Headers | undefined) {
  if (!headers) return null;
  const session = await auth.api.getSession({ headers }).catch(() => null);
  if (!session) return null;
  const mine = await db.select().from(grants).where(eq(grants.userId, session.user.id));
  const may = async (workspaceId: string, action: Action) => {
    const ws = await workspaceById(workspaceId);
    if (!ws) return false;
    if (action !== "library.read" && (await limitsOf(ws.organizationId)).readOnly) return false;
    const access = accessIn(mine, ws, await hiddenIn(ws.id));
    const orgScope = highest(...mine.filter((g) => g.resource === "organization" && g.resourceId === ws.organizationId).map((g) => g.scope));
    return can({ ...access, orgScope }, action);
  };
  return { user: session.user, orgs: [...new Set(mine.map((g) => g.organizationId))], reads: (ws: string) => may(ws, "library.read"), may };
}

/** The workspace of the portal `slug` names, when whoever is signed in may edit its brands; else null. */
export async function portalEditor(slug: string, headers: Headers) {
  const p = (await portalNamed(slug))?.p;
  return p && (await (await reader(headers))?.may(p.workspaceId, "brand.edit")) ? p.workspaceId : null;
}

async function readsWorkspace(workspaceId: string, headers: Headers | undefined) {
  return !!(await (await reader(headers))?.reads(workspaceId));
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
 * The portal a slug names, if this visitor may open it, and who they are to
 * it (D19): everyone on a public portal; partners, let in by the password or
 * an approved request's key (on any portal); members, signed in to a members
 * portal's workspace. 404 for none, 410 once it closed, 401 (`password`)
 * naming how to get in otherwise.
 */
async function open(slug: string, pass: Pass): Promise<{ p: Row; level: Audience }> {
  const p = (await portalNamed(slug))?.p;
  if (!p) throw new AssetError("not_found", "There is no portal here");
  if (p.expiresAt && p.expiresAt <= new Date()) throw new AssetError("gone", "This portal has closed");
  if (await keyValid(p, pass.key)) return { p, level: "partners" };
  if (p.access === "public") return { p, level: "everyone" };
  if (p.access === "password" && pass.password) {
    const wait = guesses.wait(p.id);
    if (wait) throw new AssetError("rate_limited", `Too many wrong passwords. Try again in ${Math.ceil(wait / 60)} min`);
    if (p.passwordHash && (await verifyPassword(pass.password, p.passwordHash))) return { p, level: "partners" };
    guesses.hit(p.id);
  }
  if (p.access === "members" && (await isMember(p, pass.headers))) return { p, level: "members" };
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

/** Its URLs signed for the visitor (lib/core/signing.ts): a day at a time, never past the portal's end. */
const shown = (a: typeof assets.$inferSelect, p: Row) => presentAsset(a, { sign: (id) => pageSig(id, p.expiresAt), presets: p.presets });

/** The portal's usable assets in `ids` (some of its collections), newest first, narrowed by `q`: its Assets view, and search. */
async function portalAssets(p: Row, { ids, q, limit = 60, offset = 0 }: { ids: string[]; q?: string | null; limit?: number; offset?: number }) {
  const tsq = q ? prefixQuery(q) : null;
  const where = and(
    deliverableSql,
    notSuperseded,
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
  return { data: rows.map((a) => shown(a, p)), total };
}

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
  const { p } = await open(slug, pass);
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
      // Its newest pictures, for its card.
      covers: sql<string[]>`array(select ${assets.id} from ${collectionAssets} ca join ${assets} on ${assets.id} = ca.asset_id where ca.collection_id = ${collections.id} and ${usable} and ${assets.mime} like 'image/%' order by ${assets.createdAt} desc limit 3)`,
    })
    .from(portalCollections)
    .innerJoin(collections, eq(collections.id, portalCollections.collectionId))
    .where(eq(portalCollections.portalId, p.id))
    .orderBy(asc(portalCollections.position));
  const ids = collection ? cols.filter((c) => c.id === collection).map((c) => c.id) : cols.map((c) => c.id);
  if (collection && !ids.length) throw new AssetError("not_found", "That collection isn't in this portal");
  const [{ data, total }, theme, showing, made] = await Promise.all([
    portalAssets(p, { ids, q, limit, offset }),
    shownTheme(p),
    brandsOf(p.id).then((l) => l.filter((b) => b.shown)),
    madeWith(p),
  ]);
  // A visitor's search, for Insights: who they are is not asked, so they are nobody in particular.
  if (!offset) recordSearch(p.workspaceId, q, total > 0, { surface: "portal", actor: "anonymous", client: null });
  // The first brand's look, so the view reads as part of its site; with no brand, the portal's accent over the app's own.
  const src = showing.length ? await publishedSource(p.workspaceId, showing[0].slug) : null;
  const look = await viewLook(p.workspaceId, src, (id) => pageSig(id, p.expiresAt), theme.accent);
  return {
    portal: {
      slug: p.slug,
      name: p.name,
      intro: p.intro,
      organization: org?.name ?? "",
      access: p.access,
      expiresAt: p.expiresAt,
      theme,
      collections: cols.map(({ covers, ...c }) => ({ ...c, covers: covers.map((id) => pagePath(id, "/w_640,f_webp", p.expiresAt)) })),
      brands: showing.map(({ slug, name, publishedAt }) => ({ slug, name, publishedAt })),
      site: await siteOf(p, showing.map((b) => b.slug)),
      look,
      madeWith: made,
    },
    data,
    total,
  };
}

/**
 * "Can I use this?" by a portal's download (PRD): the rights of one file it
 * shows, weighed for a use (lib/rights.ts), behind the same door as the
 * portal. A file it doesn't show is a 404 like one that doesn't exist. A
 * portal shows only current, approved files, so what is left to weigh is
 * the license, and nothing else is ever named instead. Recorded for
 * Insights' use-check log like every check, as the portal's.
 */
export async function checkPortalUse(slug: string, pass: Pass, { asset: id, ...use }: Use & { asset: string }) {
  const { p, level } = await open(slug, pass);
  const [a] = await db
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.id, id),
        eq(assets.workspaceId, p.workspaceId),
        deliverableSql,
        notSuperseded,
        sql`exists (select 1 from ${collectionAssets} ca join ${portalCollections} pc on pc.collection_id = ca.collection_id where ca.asset_id = ${assets.id} and pc.portal_id = ${p.id})`,
      ),
    );
  if (!a) throw new AssetError("not_found", "That file isn't in this portal");
  const date = use.date ?? today();
  const reasons = rightsReasons(a.rights, { ...use, date });
  const allowed = !reasons.some((r) => r.blocking);
  record({
    workspaceId: p.workspaceId,
    kind: "check",
    surface: "portal",
    actor: level === "members" ? "person" : "anonymous",
    client: null,
    assetId: a.id,
    version: a.version,
    verdict: allowed ? "allowed" : "refused",
    reasons: reasons.filter((r) => r.blocking).map((r) => r.code),
    offered: [],
  });
  return { allowed, asset: { id: a.id, title: a.metadata?.title ?? a.filename }, use: { ...use, date }, reasons, suggest: [] };
}

/** A rule the draft has dropped since the publish keeps an id all the same: sha256 of where it sat, shaped as a v5 UUID. */
function snapId(brandId: string, key: string, context: string | null) {
  const h = digest(`${brandId}:${key}:${context ?? ""}`);
  const x = `${h.slice(0, 12)}5${h.slice(13, 16)}${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 32)}`;
  return x.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

/**
 * One of a portal's brands, its rules as its latest publish has them (D15)
 * or as the publish `version` names, in the shape v1 froze, and which
 * version that is: a rule's id is the live rule's for its key and
 * context, else stable (snapId); `updatedAt` is when it was published. Its
 * assets show only when they may be used (lib/lifecycle.ts): a draft logo
 * stays in the library. Those, and images in its text, are signed for the
 * visitor; `signed` holds each one's signature, for URLs the page builds itself.
 */
export async function viewPortalBrand(slug: string, pass: Pass, brandSlug: string, o: { context?: string | null; version?: number } = {}) {
  const { p } = await open(slug, pass);
  const brand = (await brandsOf(p.id)).find((b) => b.slug === brandSlug);
  if (!brand) throw new AssetError("not_found", "That brand isn't in this portal");
  return readBrand(p.workspaceId, brand, p.expiresAt, o);
}

/**
 * A brand's rules as a reader outside gets them (viewPortalBrand's, and
 * BrandHub's): its publish, its usable files signed for a day, never past
 * `until`.
 */
export async function readBrand(
  workspaceId: string,
  brand: { id: string; slug: string; name: string },
  until: Date | null,
  { context, version }: { context?: string | null; version?: number } = {},
) {
  const p = { workspaceId, expiresAt: until };
  if (context && !ruleContext.safeParse(context).success) {
    throw new AssetError("invalid", `Not a context: "${context}". Contexts are slugs, e.g. dark-background`);
  }
  const src = await publishedSource(p.workspaceId, brand.slug, version);
  if (!src) throw new AssetError("not_found", version === undefined ? "That brand isn't published yet" : `Version ${version} was never published`);
  const rules = context ? resolve(src.rules, context) : src.rules;
  const live = await db
    .select({ id: brandRules.id, key: brandRules.key, context: brandRules.context, updatedAt: brandRules.updatedAt })
    .from(brandRules)
    .where(eq(brandRules.brandId, brand.id));
  const liveOf = new Map(live.map((r) => [`${r.key}\0${r.context ?? ""}`, r]));
  const ids = [...new Set([...rules.flatMap((r) => r.assets.map((a) => a.id)), ...assetIdsIn(JSON.stringify(rules))])];
  // Only this workspace's: an id pasted into a rule's text signs nothing of anyone else's.
  const usable = new Map(
    (ids.length
      ? await db
          .select({
            id: assets.id,
            title: sql<string | null>`${assets.metadata} ->> 'title'`,
            filename: assets.filename,
            mime: assets.mime,
            width: assets.width,
            height: assets.height,
            probe: assets.probe,
            rights: assets.rights,
            origin: assets.origin,
          })
          .from(assets)
          .where(and(inArray(assets.id, ids), eq(assets.workspaceId, p.workspaceId), deliverableSql))
      : []
    ).map((a) => [a.id, a]),
  );
  const signed = Object.fromEntries([...usable.keys()].map((id) => [id, pageSig(id, p.expiresAt)]));
  const publishedAt = src.version?.publishedAt ? new Date(src.version.publishedAt) : null;
  const data = rules.map((r) => {
    const now = liveOf.get(`${r.key}\0${r.context ?? ""}`);
    return {
      id: now?.id ?? snapId(brand.id, r.key, r.context),
      brand: brand.slug,
      key: r.key,
      label: r.label ?? null,
      context: r.context,
      type: r.type,
      value: r.value,
      spec: r.spec ?? null,
      usage: r.usage,
      assets: r.assets.flatMap(({ id, rendition }) => {
        const a = usable.get(id);
        if (!a) return [];
        // Read from outside: a file kept from them is drawn, never listed to take (brand.json's files).
        const kept = !isDownloadable(a);
        return [{ id, rendition: rendition ?? null, title: a.title, filename: a.filename, mime: a.mime, width: a.width, height: a.height, preview: hasPreview(a), ...(kept && { kept: true as const }) }];
      }),
      // A brand with no history shows as it stands: its rules' own times.
      updatedAt: publishedAt ?? now?.updatedAt ?? new Date(),
    };
  });
  return {
    brand: { slug: brand.slug, name: brand.name },
    version: src.version,
    data: JSON.parse(signUrlsIn(JSON.stringify(data), (id) => signed[id] ?? null)) as typeof data,
    contexts: [...new Set(src.rules.flatMap((r) => r.context ?? []))].sort(),
    signed,
  };
}

// ---- brand pages, for visitors ------------------------------------------------------

const rank = (a: Audience) => AUDIENCES.indexOf(a);

/** Some page or section of the publish is for readers above `level`. */
const gatedAbove = (src: BrandSource, level: Audience) =>
  (src.pages ?? []).some((pg) => [pg, ...pg.sections].some((x) => rank(x.audience ?? "everyone") > rank(level)));

/**
 * A visitor signed in to the workspace reads what is for members, on any
 * portal they got into. Asked only when something above them is there to
 * read: a session lookup most visits never need.
 */
async function levelFor(p: Row, level: Audience, pass: Pass, srcs: BrandSource[]): Promise<Audience> {
  if (level === "members" || !srcs.some((s) => gatedAbove(s, level))) return level;
  return (await isMember(p, pass.headers)) ? "members" : level;
}

function checkLang(lang: string | null | undefined) {
  if (lang && !LANG.safeParse(lang).success) throw new AssetError("invalid", `Not a language: "${lang}". Use a lowercase tag, e.g. ar or en-gb`);
  return lang || undefined;
}

/** The brands visitors see, and each one's publish; one gone unpublished since it was listed is left out. */
async function publishes(p: Row) {
  const list = (await brandsOf(p.id)).filter((b) => b.shown);
  const srcs = await Promise.all(list.map((b) => publishedSource(p.workspaceId, b.slug)));
  return srcs.filter((s): s is BrandSource => s !== null);
}

/**
 * The portal's site as visitors get it (lib/portal.ts PortalSite): listed
 * only while public, and its quick grab resolved: an asset while it may be
 * used, signed to download (`href`), and a page of a brand it shows.
 */
async function siteOf(p: Row, brandSlugs: string[]): Promise<PortalSite> {
  const parsed = PortalSite.safeParse(p.site);
  const site = parsed.success ? parsed.data : {};
  const ids = (site.quick ?? []).flatMap((q) => q.asset ?? []);
  const usable = new Set(
    ids.length
      ? (
          await db
            .select({ id: assets.id, mime: assets.mime, filename: assets.filename, rights: assets.rights, origin: assets.origin })
            .from(assets)
            .where(and(inArray(assets.id, ids), eq(assets.workspaceId, p.workspaceId), deliverableSql))
        )
          // A quick grab is a download: a file shown only isn't one.
          .flatMap((a) => (isDownloadable(a) ? [a.id] : []))
      : [],
  );
  const quick = site.quick?.flatMap((q) => {
    if (q.asset) return usable.has(q.asset) ? [{ ...q, href: pagePath(q.asset, "?download", p.expiresAt) }] : [];
    return q.page && q.brand && !brandSlugs.includes(q.brand) ? [] : [q];
  });
  return { ...site, ...(quick && { quick }), listed: p.access === "public" && !!site.listed };
}

/**
 * A page of a portal's brand book, for a visitor: the page `path` names (see
 * lib/site.ts resolvePath), from its brand's latest publish, at the visitor's
 * level, signed for them. `canonical` is the page's path on the portal, what
 * links use; `redirect`: the path asked was an old slug or a long form, so
 * send the reader to `canonical`. A portal showing no brand has no pages:
 * `view` is null, and its Assets view is the portal.
 */
export async function viewPortalSite(
  slug: string,
  pass: Pass,
  o: { path?: string | null; context?: string | null; lang?: string | null; find?: { section: string; q: string } } = {},
) {
  const { p, level: door } = await open(slug, pass);
  const lang = checkLang(o.lang);
  const path = (o.path ?? "").split("/").filter(Boolean);
  const [list, [col], theme, made] = await Promise.all([
    brandsOf(p.id),
    db.select({ id: portalCollections.collectionId }).from(portalCollections).where(eq(portalCollections.portalId, p.id)).limit(1),
    shownTheme(p),
    madeWith(p),
  ]);
  const showing = list.filter((b) => b.shown);
  const slugs = showing.map((b) => b.slug);
  const portal = {
    slug: p.slug,
    name: p.name,
    theme,
    site: await siteOf(p, slugs),
    brands: showing.map(({ slug, name, publishedAt }) => ({ slug, name, publishedAt })),
    assets: !!col,
    madeWith: made,
  };
  const firstSrc = showing.length ? await publishedSource(p.workspaceId, showing[0].slug) : null;
  if (!firstSrc) {
    if (path.length) throw new AssetError("not_found", "There is no page here");
    return { portal: { ...portal, level: door }, canonical: null, redirect: false, view: null };
  }
  const first = firstSrc.brand.slug;
  // What a one-segment path may name of the first brand: every page some visitor may open, a locked one too (it shows its lock), and old slugs.
  const reach = readablePages(firstSrc, { level: "members" });
  const firstBrand = { slugs: reach.map((pg) => pg.slug), aliases: Object.fromEntries(reach.flatMap((pg) => (pg.aliases ?? []).map((a) => [a, pg.slug]))) };
  const asked = resolvePath(path, slugs, firstBrand);
  const to = asked.kind === "redirect" ? resolvePath(asked.path, slugs, firstBrand) : asked;
  if (to.kind !== "page") throw new AssetError("not_found", "There is no page here");
  const src = to.brand === first ? firstSrc : await publishedSource(p.workspaceId, to.brand);
  if (!src) throw new AssetError("not_found", "There is no page here");
  const level = await levelFor(p, door, pass, [src]);
  const view = await viewPage(p.workspaceId, src, to.page, {
    context: o.context || undefined,
    lang,
    level,
    // Never `as`: collections read as the workspace's reader, not as whoever is signed in.
    sign: (id) => pageSig(id, p.expiresAt),
    presets: p.presets,
    find: o.find,
  });
  const at = view.page?.slug ?? view.redirect ?? to.page;
  const canonical = `/${(at ? canonicalPath(first, to.brand, at) : to.brand === first ? [] : [to.brand]).join("/")}`;
  return { portal: { ...portal, level }, canonical, redirect: asked.kind === "redirect" || !!view.redirect, view };
}

/**
 * Search a portal: every brand it shows, its publish at the visitor's level,
 * so nothing hidden or locked is found (lib/site.ts searchSite over
 * lib/page-view.ts readablePages), best first brand by brand; and its
 * collections' assets.
 */
export async function searchPortal(slug: string, pass: Pass, { q, lang }: { q: string; lang?: string | null }) {
  const { p, level: door } = await open(slug, pass);
  const inLang = checkLang(lang);
  if (!q.trim()) return { hits: [], assets: [] };
  const srcs = await publishes(p);
  const level = await levelFor(p, door, pass, srcs);
  const found = srcs.map((src) =>
    searchSite(readablePages(src, { level, lang: inLang }), src.rules, q).map((h) => ({
      ...h,
      brand: src.brand.slug,
      path: `/${canonicalPath(srcs[0].brand.slug, src.brand.slug, h.page).join("/")}`,
    })),
  );
  // Each brand's best, then each one's second: one brand's many hits don't bury another's best.
  const hits = found
    .flatMap((hs, b) => hs.map((h, i) => ({ h, i, b })))
    .sort((x, y) => x.i - y.i || x.b - y.b)
    .slice(0, 20)
    .map((x) => x.h);
  const ids = (await db.select({ id: portalCollections.collectionId }).from(portalCollections).where(eq(portalCollections.portalId, p.id))).map((c) => c.id);
  const matches = (await portalAssets(p, { ids, q, limit: 12 })).data;
  recordSearch(p.workspaceId, q, hits.length + matches.length > 0, { surface: "portal", actor: "anonymous", client: null });
  return { hits, assets: matches };
}

/** What's new in one of a portal's brands (the first when not named): its publishes, newest first, their pictures signed in `media`. */
export async function portalUpdates(slug: string, pass: Pass, brandSlug?: string | null) {
  const { p } = await open(slug, pass);
  const showing = (await brandsOf(p.id)).filter((b) => b.shown);
  const brand = brandSlug ? showing.find((b) => b.slug === brandSlug) : showing[0];
  if (!brand) throw new AssetError("not_found", "That brand isn't in this portal");
  const updates = await listUpdates(brand.id);
  const ids = [...new Set(updates.flatMap((u) => u.image ?? []))];
  const rows = ids.length ? await db.select().from(assets).where(and(inArray(assets.id, ids), eq(assets.workspaceId, p.workspaceId), deliverableSql)) : [];
  const media = Object.fromEntries(rows.map((a) => [a.id, shown(a, p)]));
  // A publish's picture shows while it may be used, like any other.
  return { data: updates.map((u) => ({ ...u, image: u.image && media[u.image] ? u.image : null })), media };
}

/** Where a brand is published: the portals showing it, for publish to name (1.10). */
export async function portalsShowing(ws: string, brandId: string) {
  const rows = await db
    .select({ id: portals.id, slug: portals.slug, name: portals.name, workspaceId: portals.workspaceId, access: portals.access })
    .from(portalBrands)
    .innerJoin(portals, eq(portals.id, portalBrands.portalId))
    .where(and(eq(portalBrands.brandId, brandId), eq(portals.workspaceId, ws)))
    .orderBy(asc(portals.name));
  return Promise.all(rows.map(async (p) => ({ slug: p.slug, name: p.name, access: p.access, url: await portalUrl(p, await domainOf(p.id)) })));
}

/**
 * The open public portals that show an asset to anyone, and until when (null:
 * no end): what a visitor with no password can already take from them,
 * signed. Shown means in one of their collections, or named by a brand they
 * show, in its latest publish: its rules, which visitors read whole, and its
 * pages and sections for everyone, collection sections included. Only an
 * asset that may be used; a stack's earlier version shows in no collection.
 */
export async function publicPortalsShowing(ws: string, assetId: string) {
  const [rows, [asset]] = await Promise.all([
    db
      .select()
      .from(portals)
      .where(and(eq(portals.workspaceId, ws), eq(portals.access, "public"), sql`(${portals.expiresAt} is null or ${portals.expiresAt} > now())`))
      .orderBy(asc(portals.name)),
    db
      .select({ id: assets.id, current: sql<boolean>`${notSuperseded}` })
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.workspaceId, ws), deliverableSql)),
  ]);
  if (!rows.length || !asset) return [];
  const inCollections = asset.current
    ? new Set(
        (
          await db
            .select({ portalId: portalCollections.portalId })
            .from(portalCollections)
            .innerJoin(collectionAssets, eq(collectionAssets.collectionId, portalCollections.collectionId))
            .where(and(eq(collectionAssets.assetId, asset.id), inArray(portalCollections.portalId, rows.map((p) => p.id))))
        ).map((r) => r.portalId),
      )
    : new Set<string>();
  const shows = async (p: Row) => {
    if (inCollections.has(p.id) || p.theme.logo === asset.id) return true;
    // Its header, as shownTheme draws it: the organization's logo, when the portal has none of its own, and icon.
    const brand = await brandOfWorkspace(p.workspaceId);
    if (assetIdsIn(JSON.stringify([p.theme.logo ? null : brand.logo, brand.icon])).includes(asset.id)) return true;
    const quick = PortalSite.safeParse(p.site);
    if (quick.success && quick.data.quick?.some((q) => q.asset === asset.id)) return true;
    for (const src of await publishes(p)) {
      const pages = readablePages(src, { level: "everyone" });
      const named = new Set([
        ...src.rules.flatMap((r) => [...r.assets.map((a) => a.id), ...specAssets(r.spec)]),
        ...pages.flatMap((pg) => assetRefs(pg).map((r) => r.id)),
        ...(src.theme.device ? [src.theme.device] : []),
        ...assetIdsIn(JSON.stringify([src.rules, pages.map((pg) => pg.sections)])),
      ]);
      if (named.has(asset.id)) return true;
      if (!asset.current) continue;
      // As a visitor gets each section: its first page of items, where readers find it without searching.
      for (const s of pages.flatMap((pg) => pg.sections).filter((s) => isLive(s.template))) {
        const { items } = await collectionItems(p.workspaceId, liveProps(s), { sign: null, presets: p.presets });
        if (items.some((i) => i.id === asset.id)) return true;
      }
    }
    return false;
  };
  // ponytail: each public portal's publishes, pages and collection sections read again per call; an index of what portals show when a workspace has many.
  const showing = [];
  for (const p of rows) if (await shows(p)) showing.push({ slug: p.slug, name: p.name, expiresAt: p.expiresAt, url: await portalUrl(p, await domainOf(p.id)) });
  return showing;
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

/** What a request section asks for, in the admins' email. */
const WANTS: Record<Exclude<RequestKind, "access">, string> = { asset: "asks for an asset", review: "asks for a review", question: "has a question" };

/**
 * Ask into a portal that isn't public (`kind` access, the default), or ask
 * its brand team from a request section (an asset, a review, a question).
 * It always answers the same, so it can't be used to learn who has asked
 * before; a second ask for access while one waits is the same ask.
 *
 * An ask comes from inside: it takes the site's own door (`pass`), and names
 * a request section the visitor can read, when it names one. So the door
 * never tells an outsider which pages lie behind it.
 */
export async function requestAccess(
  slug: string,
  input: { email: string; name?: string; note?: string; kind?: RequestKind; page?: string; section?: string },
  ip: string | null,
  pass: Pass = {},
) {
  const kind = input.kind ?? "access";
  if (kind === "access" && (input.page || input.section)) throw new AssetError("invalid", "page and section: only an ask from a request section says where it came from");
  if (input.section && !input.page) throw new AssetError("invalid", "section: give the page it is on too");
  let p: Row;
  let level: Audience = "everyone";
  if (kind === "access") {
    [p] = await db.select().from(portals).where(eq(portals.slug, slug));
    if (!p) throw new AssetError("not_found", "There is no portal here");
    // A public portal takes asks when some page or section of what it shows is for partners or members.
    if (p.access === "public" && !(await publishes(p)).some((src) => gatedAbove(src, "everyone"))) {
      throw new AssetError("invalid", "This portal is open: no need to ask");
    }
    if (p.expiresAt && p.expiresAt <= new Date()) throw new AssetError("gone", "This portal has closed");
  } else ({ p, level } = await open(slug, pass));
  // Five an hour from one address, thirty an hour in all: enough for real people, not for a flood of email to admins.
  const wait = asks.hit(`${ip ?? "?"}:${p.id}`) || floods.hit(p.id);
  if (wait) throw new AssetError("rate_limited", `Too many requests. Try again in ${Math.ceil(wait / 60)} min`);
  if (input.page) {
    const srcs = await publishes(p);
    const reader = await levelFor(p, level, pass, srcs);
    const asking = (s: { id: string; template: string }) => s.id === input.section && s.template === "request";
    const from = srcs.some((src) => readablePages(src, { level: reader }).some((pg) => pg.slug === input.page && (!input.section || pg.sections.some(asking))));
    if (!from) throw new AssetError("invalid", input.section ? `No request section ${input.section} on the ${input.page} page` : `No page ${input.page}`);
  }
  const email = input.email.trim().toLowerCase();
  // Each ask is its own message; only access is asked once.
  const [waiting] =
    kind === "access"
      ? await db
          .select({ id: portalRequests.id })
          .from(portalRequests)
          .where(and(eq(portalRequests.portalId, p.id), eq(portalRequests.email, email), eq(portalRequests.kind, "access"), eq(portalRequests.status, "pending")))
      : [];
  if (!waiting) {
    const note = input.note || null;
    await db.insert(portalRequests).values({ portalId: p.id, email, name: input.name || null, note, kind, page: input.page ?? null, section: input.section ?? null });
    const ws = await workspaceById(p.workspaceId);
    const manage = `${await appUrlFor(ws?.organizationId ?? null)}/portals?open=${p.id}`;
    const who = input.name ? `${input.name} (${email})` : email;
    for (const to of await adminsOf(p)) {
      const draft = portalRequestEmail(to, { portal: p.name, who, note, url: manage });
      // ponytail: an ask's words over the access email's; its own template in core/mail.ts when asks grow more than a line.
      if (kind !== "access") {
        draft.subject = `${who} ${WANTS[kind]} on ${p.name}`;
        draft.lines[0] = `${who} ${WANTS[kind]}${input.page ? `, from the ${input.page} page` : ""} of the ${p.name} portal.`;
      }
      await sendAs(ws?.organizationId ?? null, draft);
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
    kind: r.kind,
    page: r.page,
    section: r.section,
    expiresAt: r.expiresAt,
    decidedBy: r.decidedBy,
    decidedAt: r.decidedAt,
    createdAt: r.createdAt,
    url: key ? `${await portalUrl(p, d)}?key=${key}` : null,
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

/**
 * Say yes or no. Yes to access makes them a link of their own, emailed when
 * email works, and shown to copy either way; yes to an ask marks it done.
 */
export async function decideRequest(caller: Caller, portalId: string, requestId: string, status: Exclude<PortalRequestStatus, "pending">) {
  mayManage(caller);
  const p = await row(caller, portalId);
  if (!p) return null;
  const [r] = await db.select().from(portalRequests).where(and(eq(portalRequests.id, requestId), eq(portalRequests.portalId, p.id)));
  if (!r) return null;
  // An ask answered lets nobody in.
  const key = status === "approved" && r.kind === "access" ? randomBytes(24).toString("base64url") : null;
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
  // Deleted since it was read.
  if (!next) return null;
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
