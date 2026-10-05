import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import type { PortalBody } from "@/components/portal-assets";
import { type Loaded, PortalView, type SiteBody } from "@/components/portal-view";
import { PRODUCT } from "@/lib/branding";
import { portalEditor } from "@/lib/core/portals";
import { env } from "@/lib/env";
import { plainText } from "@/lib/markdown";
import { getBody, iconOf } from "@/lib/sidebar";

type Search = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ slug: string; path?: string[] }>; searchParams: Promise<Search> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null;

/** The query as asked, less `drop`: what a redirect carries along. */
function query(sp: Search, drop?: string) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (k !== drop) for (const x of [v ?? []].flat()) q.append(k, x);
  return q.size ? `?${q}` : "";
}

/** A path on the portal (`/`, `/logo`) at its link base: /p/{slug}, or nothing on its own domain. */
const at = (base: string, path: string) => base + (path === "/" ? "" : path) || "/";

/**
 * What the address shows, once per request: the metadata and the page share
 * it, so the visitor's first paint is the portal in its own look. A page of
 * the site (GET /api/v1/portal/{slug}/site), else the Assets view (GET
 * /api/v1/portal/{slug}): asked for with ?view=assets, named by an old
 * link's ?collection=, ?q= or ?asset= with no page, or the whole portal when
 * it shows no brand. A link to a collection the portal no longer shows opens
 * it unfiltered. The key from an approved request's link (?key=) goes along,
 * so its first paint is the portal, not the door it already opens.
 */
const first = cache(
  async (slug: string, path: string, assets: boolean, q: string | null, collection: string | null, context: string | null, lang: string | null, key: string | null) => {
    const h = key ? { "X-Portal-Key": key } : undefined;
    const site = assets
      ? null
      : await getBody<SiteBody>(`portal/${encodeURIComponent(slug)}/site?${new URLSearchParams({ path, ...(context && { context }), ...(lang && { lang }) })}`, h);
    if (!assets && (!site?.data || site.data.view)) return { site, assets: null, collection };
    const list = (c: string | null) =>
      getBody<PortalBody>(`portal/${encodeURIComponent(slug)}?${new URLSearchParams({ limit: "60", ...(q && { q }), ...(c && { collection: c }) })}`, h);
    const body = await list(collection);
    if (collection && body?.error?.code === "not_found") return { site, assets: await list(null), collection: null };
    return { site, assets: body, collection };
  },
);

/**
 * The address as asked: the portal, its path, and what it shows. An old
 * slug, a long form or an old ?brand= link goes to the address now, for
 * good; nothing there is a 404. Thrown here, where the metadata asks too: a
 * crawler that waits for the metadata gets them as HTTP statuses, a browser
 * behind loading.tsx's stream as a client-side redirect or a noindex page.
 */
async function asked({ params, searchParams }: Props) {
  const [{ slug, path = [] }, sp, h] = await Promise.all([params, searchParams, headers()]);
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const app = new URL(env.APP_URL);
  // A portal's own domain rather than the app's: its paths start at the root (src/proxy.ts).
  const own = !!host && host !== app.host;
  const base = own ? "" : `/p/${slug}`;
  const where = path.join("/");
  const brand = one(sp.brand);
  if (brand && !where) permanentRedirect(`${at(base, `/${encodeURIComponent(brand)}`)}${query(sp, "brand")}`);
  const assets = one(sp.view) === "assets" || (!where && !!(one(sp.collection) || one(sp.q) || one(sp.asset)));
  const got = await first(slug, where, assets, one(sp.q), one(sp.collection), one(sp.context), one(sp.lang), one(sp.key));
  if ([got.site, got.assets].some((b) => b?.error?.code === "not_found")) notFound();
  const d = got.site?.data;
  if (d?.redirect && d.canonical) permanentRedirect(`${at(base, d.canonical)}${query(sp)}`);
  return { slug, where, sp, own, base, origin: new URL(host ? `${app.protocol}//${host}` : app.origin), got };
}

/** Named, iconed and unfurled as its organization, not as whoever runs the server. */
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { origin, got } = await asked(props);
  const d = got.site?.data;
  // Search engines list a portal only when it asks to be listed, and is public (site.listed says both).
  const robots = d?.portal.site.listed ? { index: true, follow: true } : { index: false, follow: false };
  if (d?.view && !got.assets) {
    const { portal, view } = d;
    const page = view.page;
    const title = page ? `${page.title} - ${view.brand.name}` : `${view.brand.name} - ${portal.name}`;
    const said = page && (page.lede || page.sections.map((s) => s.lede || s.body).find(Boolean));
    const description = said ? plainText(said).slice(0, 200) : undefined;
    const cover = page?.cover ? view.media[page.cover]?.preview : null;
    const image = cover ?? portal.theme.logo;
    return {
      metadataBase: origin,
      title: { absolute: title },
      description,
      openGraph: { title, description, ...(image && { images: [image] }) },
      icons: { icon: iconOf({ icon: portal.theme.icon ?? null, custom: portal.theme.product !== PRODUCT }) },
      robots,
    };
  }
  const b = got.assets ?? got.site;
  const portal = got.assets?.portal;
  const door = b?.error?.detail;
  const name = portal?.name ?? door?.name;
  const theme = portal?.theme ?? door?.theme;
  const title = name && theme ? `${name} - ${theme.product}` : "Portal";
  // Always said here, so the product's own tagline never shows through for someone else's portal.
  const description = portal
    ? portal.intro
      ? plainText(portal.intro).slice(0, 200)
      : `Brand assets from ${portal.organization}`
    : door
      ? door.access === "members"
        ? "A brand portal for the team behind it. Anyone else can ask for access."
        : "A brand portal behind a password. Anyone else can ask for access."
      : undefined;
  return {
    metadataBase: origin,
    title: name && theme ? { absolute: title } : title,
    description,
    openGraph: { title, description, ...(theme?.logo && { images: [theme.logo] }) },
    ...(theme && { icons: { icon: iconOf({ icon: theme.icon ?? null, custom: theme.product !== PRODUCT }) } }),
    robots,
  };
}

/**
 * A brand portal (3.2.3): /p/{portal} is its first brand's first page,
 * /p/{portal}/{page} a page of that brand, else another brand's first page,
 * /p/{portal}/{brand}/{page} a page of another brand. On its own domain the
 * same paths start at the root.
 */
export default async function PortalPage(props: Props) {
  const [{ slug, where, sp, own, base, got }, h] = await Promise.all([asked(props), headers()]);
  const { site, assets, collection } = got;
  const context = one(sp.context);
  const lang = one(sp.lang);
  const initial: Loaded | null = assets
    ? { assets, q: one(sp.q) ?? "", collection, asset: one(sp.asset) }
    : site
      ? { site, query: context || lang ? `?${new URLSearchParams({ ...(context && { context }), ...(lang && { lang }) })}` : "" }
      : null;
  // On the app's host, where the session reaches: someone who may edit its brands gets the floating Edit.
  const workspace = own ? null : await portalEditor(slug, h);
  return (
    <PortalView
      slug={slug}
      base={base}
      path={where}
      initial={initial}
      ownDomain={own}
      editor={workspace ? { workspace, app: env.APP_URL } : null}
      privacy={env.PRIVACY_URL ?? null}
    />
  );
}
