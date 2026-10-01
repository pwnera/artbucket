import { and, eq, inArray, isNotNull, isNull, like, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, brandVersions, domains, hubOffersRefused, hubReports, organizations, workspaces } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { recordAudit } from "@/lib/core/audit";
import { publishBrand } from "@/lib/core/brand";
import { deleteBrand, setHub } from "@/lib/core/brands";
import { AssetError } from "@/lib/core/errors";
import { startFrom } from "@/lib/core/hub";
import { env } from "@/lib/env";
import { claimProof } from "@/lib/domain-proof";
import { domainsAbove, hubHome, hubPath } from "@/lib/hub";
import { can, needs } from "@/lib/permissions";

/**
 * Claim by domain (BrandHub): a public listing names its brand's domain
 * (brands.domain), and an organization that proved that domain (Settings,
 * Domains) is offered the listings of other organizations that did not.
 * Taking one starts a brand of its own from it, as "Start from this brand"
 * does, public on BrandHub; the listing goes private and its address leads
 * to the new one for good. No brand moves between organizations. Nothing is
 * stored until an offer is taken or refused: verifying a domain is what makes
 * the offers (lib/core/domains.ts proveHost).
 */

const mayManage = (caller: Caller) => {
  if (!can(caller, "organization.manage")) throw new AssetError("forbidden", `BrandHub settings take ${needs("organization.manage")}`);
};

const verifiedHosts = async (orgIds: string[]) => {
  const rows = orgIds.length
    ? await db
        .select({ orgId: domains.organizationId, host: domains.host })
        .from(domains)
        .where(and(inArray(domains.organizationId, orgIds), isNotNull(domains.verifiedAt)))
    : [];
  const out = new Map<string, string[]>();
  for (const r of rows) out.set(r.orgId, [...(out.get(r.orgId) ?? []), r.host]);
  return out;
};

/**
 * The listings offered to the caller's organization: public ones of other
 * organizations whose domain one of its verified hosts proves
 * (lib/domain-proof.ts provesDomain), whose own organization proves none of it, and
 * that it hasn't refused. `proof` is the host that proves it.
 */
export async function claimOffers(caller: Caller) {
  mayManage(caller);
  const mine = caller.workspace.organizationId;
  const hosts = (await verifiedHosts([mine])).get(mine) ?? [];
  if (!hosts.length) return [];
  const rows = await db
    .select({ id: brands.id, org: organizations.slug, orgId: organizations.id, owner: organizations.name, brand: brands.slug, name: brands.name, domain: brands.domain })
    .from(brands)
    .innerJoin(workspaces, eq(workspaces.id, brands.workspaceId))
    .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
    .where(
      and(
        or(inArray(brands.domain, hosts.flatMap(domainsAbove)), ...hosts.map((h) => like(brands.domain, `%.${h.replace(/^www\./, "")}`))),
        ne(workspaces.organizationId, mine),
        eq(brands.visibility, "public"),
        isNull(brands.hubDelisted),
        sql`exists (select 1 from ${brandVersions} v where v.brand_id = ${brands.id} and v.published_at is not null)`,
        sql`not exists (select 1 from ${hubOffersRefused} r where r.brand_id = ${brands.id} and r.organization_id = ${mine})`,
      ),
    )
    .limit(100);
  const owners = await verifiedHosts([...new Set(rows.map((r) => r.orgId))]);
  const home = hubHome("public", env.APP_URL, env.HUB_URL ?? env.APP_URL);
  return rows.flatMap(({ orgId, ...r }) => {
    const proof = claimProof(r.domain, hosts, owners.get(orgId) ?? []);
    return proof ? [{ ...r, domain: r.domain!, proof, url: home + hubPath(r.org, r.brand) }] : [];
  });
}

export type ClaimOffer = Awaited<ReturnType<typeof claimOffers>>[number];

async function offerAt(caller: Caller, org: string, slug: string) {
  const offer = (await claimOffers(caller)).find((o) => o.org === org && o.brand === slug);
  if (!offer) throw new AssetError("not_found", `No offer for ${org}/${slug}: it names no domain your organization proved, or its own organization proved it`);
  return offer;
}

/**
 * Take an offer: a brand of the caller's own from the listing's release
 * (`slug`, its slug unless said), with its domain, published and public on
 * BrandHub. The listing goes private, its address leading to the new one,
 * and its organization's admins find a resolved claim in Settings, BrandHub,
 * and the change in their audit log.
 */
export async function acceptOffer(caller: Caller, org: string, slug: string, input: { slug?: string } = {}) {
  mayManage(caller);
  if (!caller.user) throw new AssetError("forbidden", "A person claims a listing, signed in: not a key");
  const offer = await offerAt(caller, org, slug);
  const made = await startFrom(caller, { name: offer.name, slug: input.slug ?? offer.brand, from: `${org}/${slug}`, domain: offer.domain });
  let hub;
  try {
    await publishBrand(caller, made.slug, { note: `Claimed from ${org}/${slug} on BrandHub, by proving ${offer.proof}` });
    hub = await setHub(caller, made.slug, { visibility: "public" });
  } catch (err) {
    await deleteBrand(caller.workspace.id, made.slug).catch(() => {});
    throw err;
  }
  const [was] = await db
    .update(brands)
    .set({ visibility: "private", hubMovedTo: hub.ref })
    .where(eq(brands.id, offer.id))
    .returning({ workspaceId: brands.workspaceId });
  await db.insert(hubReports).values({
    brandId: offer.id,
    kind: "claim",
    reason: "claim",
    status: "resolved",
    note: `Claimed by proving ${offer.domain}: taken off BrandHub, its address now leads to ${hub.ref}`,
    contact: caller.user.email,
    claimantId: caller.workspace.organizationId,
    proof: offer.proof,
  });
  const [owner] = await db.select({ organizationId: workspaces.organizationId }).from(workspaces).where(eq(workspaces.id, was.workspaceId));
  await recordAudit(caller, "brand.private", offer.name, { brand: offer.brand, claimedBy: hub.ref, proof: offer.proof }, { organizationId: owner.organizationId, workspaceId: was.workspaceId });
  await recordAudit(caller, "brand.claimed", made.name, { brand: made.slug, from: `${org}/${slug}`, proof: offer.proof });
  return { ...made, hub };
}

/** Say a listing offered isn't the organization's brand: it is offered no more. */
export async function refuseOffer(caller: Caller, org: string, slug: string) {
  const offer = await offerAt(caller, org, slug);
  await db.insert(hubOffersRefused).values({ organizationId: caller.workspace.organizationId, brandId: offer.id }).onConflictDoNothing();
  return { refused: true as const };
}

/** Where a listing claimed by domain went, {org, brand}: its address leads there. Null for any other. */
export async function hubMoved(org: string, slug: string) {
  const [b] = await db
    .select({ to: brands.hubMovedTo })
    .from(brands)
    .innerJoin(workspaces, eq(workspaces.id, brands.workspaceId))
    .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
    .where(and(eq(organizations.slug, org), eq(brands.slug, slug), isNotNull(brands.hubMovedTo), eq(brands.visibility, "private")));
  const [o, s] = b?.to?.split("/") ?? [];
  return o && s ? { org: o, brand: s } : null;
}
