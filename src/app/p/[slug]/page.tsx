import type { Metadata } from "next";
import { headers } from "next/headers";
import { cache } from "react";
import { PortalView, type PortalBody } from "@/components/portal-view";
import { PRODUCT } from "@/lib/branding";
import { env } from "@/lib/env";
import { getBody, iconOf } from "@/lib/sidebar";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null;

/**
 * The portal's first page, once per request: the metadata and the page share
 * it, so the visitor's first paint is the portal in its own look. A link to
 * a collection the portal no longer shows opens it unfiltered. The key from
 * an approved request's link (?key=) goes along, so its first paint is the
 * portal, not the door it already opens.
 */
const first = cache(async (slug: string, q: string | null, collection: string | null, key: string | null) => {
  const at = (c: string | null) =>
    getBody<PortalBody>(
      `portal/${encodeURIComponent(slug)}?${new URLSearchParams({ limit: "60", ...(q && { q }), ...(c && { collection: c }) })}`,
      key ? { "X-Portal-Key": key } : undefined,
    );
  const body = await at(collection);
  if (collection && body?.error?.code === "not_found") return { body: await at(null), collection: null };
  return { body, collection };
});

/** The host this was asked at, and whether it is a portal's own domain rather than the app's. */
async function asked() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const app = new URL(env.APP_URL);
  return { base: new URL(host ? `${app.protocol}//${host}` : app.origin), own: !!host && host !== app.host };
}

/** Markdown to a line of plain text, for a link preview. */
const plain = (md: string) =>
  md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>`~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

/** Named, iconed and unfurled as its organization, not as whoever runs the server. */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp, { base }] = await Promise.all([params, searchParams, asked()]);
  const { body: b } = await first(slug, one(sp.q), one(sp.collection), one(sp.key));
  const portal = b?.portal;
  const door = b?.error?.detail;
  const name = portal?.name ?? door?.name;
  const theme = portal?.theme ?? door?.theme;
  const title = name && theme ? `${name} - ${theme.product}` : "Portal";
  // Always said here, so the product's own tagline never shows through for someone else's portal.
  const description = portal
    ? portal.intro
      ? plain(portal.intro)
      : `Brand assets from ${portal.organization}`
    : door
      ? door.access === "members"
        ? "A brand portal for the team behind it. Anyone else can ask for access."
        : "A brand portal behind a password. Anyone else can ask for access."
      : undefined;
  return {
    metadataBase: base,
    title: name && theme ? { absolute: title } : title,
    description,
    openGraph: { title, description, ...(theme?.logo && { images: [theme.logo] }) },
    ...(theme && { icons: { icon: iconOf({ icon: theme.icon ?? null, custom: theme.product !== PRODUCT }) } }),
    robots: { index: false, follow: false },
  };
}

/** A brand portal. Everything it shows comes from /api/v1/portal/{slug}. */
export default async function PortalPage({ params, searchParams }: Props) {
  const [{ slug }, sp, { own }] = await Promise.all([params, searchParams, asked()]);
  const q = one(sp.q);
  const { body, collection } = await first(slug, q, one(sp.collection), one(sp.key));
  return <PortalView slug={slug} initial={body} q={q ?? ""} collection={collection} brand={one(sp.brand)} asset={one(sp.asset)} ownDomain={own} />;
}
