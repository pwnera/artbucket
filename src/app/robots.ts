import type { MetadataRoute } from "next";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { portalAtHost } from "@/lib/core/domains";
import { db } from "@/lib/db";
import { portals } from "@/lib/db/schema";

/** Portals search engines may list: public, open, and set to be listed (portals.site.listed). */
const listed = (slug?: string) =>
  db
    .select({ slug: portals.slug })
    .from(portals)
    .where(
      and(
        eq(portals.access, "public"),
        sql`(${portals.site} ->> 'listed')::boolean is true`,
        or(isNull(portals.expiresAt), gt(portals.expiresAt, sql`now()`)),
        slug ? eq(portals.slug, slug) : undefined,
      ),
    );

/**
 * robots.txt, per host (3.4 item 8): reading the host makes it request-time.
 * A portal's own domain is listed whole when the portal is, else not at all.
 * On the app's, the API, asset bytes, portals and shares stay out, except
 * the portals that ask to be listed.
 * ponytail: no sitemap until a listed portal asks for one.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") ?? "";
  const portal = host ? await portalAtHost(host).catch(() => null) : null;
  if (portal) {
    const [open] = await listed(portal).catch(() => []);
    return { rules: open ? { userAgent: "*", allow: "/" } : { userAgent: "*", disallow: "/" } };
  }
  const shown = await listed().catch(() => []);
  return {
    rules: {
      userAgent: "*",
      ...(shown.length > 0 && { allow: shown.map((p) => `/p/${p.slug}`) }),
      disallow: ["/api/", "/a/", "/p/", "/s/"],
    },
  };
}
