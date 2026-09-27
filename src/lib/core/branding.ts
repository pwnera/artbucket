import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, organizations, workspaces } from "@/lib/db/schema";
import { callerFrom } from "@/lib/core/access";
import { deliverableSql } from "@/lib/core/assets";
import { appUrlFor, hostTarget } from "@/lib/core/domains";
import { effective } from "@/lib/core/settings";
import { DEFAULT_BRANDING, type Brand, type BrandingSettings } from "@/lib/branding";
import { resolve } from "@/lib/settings";

/**
 * Whose brand a request sees (lib/branding.ts). On an organization's own
 * domain, or a portal's, that organization's. On APP_URL, the organization of
 * whoever is signed in or holds the key; for nobody, the only organization
 * when there is just one (a team's own server), else the server's (BRAND_*).
 */

/** An image the brand points at, if it may be shown: approved, and the organization's own. */
async function servable(organizationId: string, id: string | null, spec: string) {
  if (!id) return null;
  const [a] = await db
    .select({ id: assets.id })
    .from(assets)
    .innerJoin(workspaces, eq(workspaces.id, assets.workspaceId))
    .where(and(eq(assets.id, id), eq(workspaces.organizationId, organizationId), deliverableSql));
  return a ? `/a/${a.id}/${spec}` : null;
}

const differs = (v: BrandingSettings) => (Object.keys(DEFAULT_BRANDING) as (keyof BrandingSettings)[]).some((k) => v[k] !== DEFAULT_BRANDING[k]);

/** An organization's brand, or with none the server's. Image URLs are host-relative. */
export async function brandOf(organizationId: string | null): Promise<Brand> {
  const { value } = organizationId ? await effective("branding", { organizationId }) : resolve("branding", {}, process.env);
  const [logo, icon] = organizationId
    ? await Promise.all([servable(organizationId, value.logo, "h_128,f_webp"), servable(organizationId, value.icon, "w_64,h_64,fit_cover,f_png")])
    : [null, null];
  return { name: value.name, tagline: value.tagline, logo, icon, accent: value.accent, emailFooter: value.emailFooter, custom: differs(value) };
}

async function onlyOrganization() {
  const rows = await db.select({ id: organizations.id }).from(organizations).orderBy(asc(organizations.createdAt)).limit(2);
  return rows.length === 1 ? rows[0].id : null;
}

/** The organization a request is branded as, or null for the server's own. */
export async function organizationFor(req: Request): Promise<string | null> {
  // The app's own pages ask with the host they were asked at (lib/sidebar.ts get).
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const at = await hostTarget(host);
  if (at) return at.organizationId;
  const caller = await callerFrom(req);
  if (caller && (caller.user || caller.key)) return caller.workspace.organizationId;
  return onlyOrganization();
}

/** GET /api/v1/branding */
export const brandFor = async (req: Request) => brandOf(await organizationFor(req));

/** For email: the organization's brand, with its logo as an absolute URL mail clients can load. */
export async function emailBrand(organizationId: string | null) {
  const brand = await brandOf(organizationId);
  const base = await appUrlFor(organizationId);
  return { ...brand, logo: brand.logo && `${base}${brand.logo}` };
}

/** Whether a workspace's organization has a brand of its own, and it: for share links and portals. */
export async function brandOfWorkspace(workspaceId: string) {
  const [w] = await db.select({ org: workspaces.organizationId }).from(workspaces).where(eq(workspaces.id, workspaceId));
  return brandOf(w?.org ?? null);
}
