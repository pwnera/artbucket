import type { Metadata } from "next";
import { headers } from "next/headers";
import { cache } from "react";
import { SharedView, type SharedBody } from "@/components/shared-view";
import { env } from "@/lib/env";
import { getBody, iconOf } from "@/lib/sidebar";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** What the link shows, once per request: the metadata and the page share it, and the first paint is the link, not a loading line. */
const first = cache((token: string) => getBody<SharedBody>(`shared/${encodeURIComponent(token)}`));

/** Where this was asked, so a logo's relative URL unfurls from the same host. */
async function base() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const app = new URL(env.APP_URL);
  return new URL(host ? `${app.protocol}//${host}` : app.origin);
}

/** In the brand of the organization that shared it, not the visitor's; described as theirs, so a link preview says who sent it. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ token }, metadataBase] = await Promise.all([params, base()]);
  const b = await first(token);
  const share = b?.share;
  const brand = share?.brand ?? b?.error?.detail?.brand;
  const name = share ? (share.name ?? share.target.label) : b?.error?.detail?.name;
  const title = brand ? `${name ?? "Shared"} - ${brand.name}` : "Shared";
  const by = share?.organization ?? (brand?.custom ? brand.name : null);
  const description = !brand
    ? undefined
    : share?.kind === "upload"
      ? `Send files${by ? ` to ${by}` : ""}, no account needed.`
      : `${by ? `Shared by ${by}` : "Shared with you"}${share ? "" : ". It asks for a password."}`;
  // One asset unfurls as itself; a collection as whose it is.
  const image = (share?.target.type === "asset" && b?.data?.[0]?.thumbnail) || brand?.logo;
  return {
    metadataBase,
    title: brand ? { absolute: title } : title,
    description,
    openGraph: { title, description, ...(image && { images: [image] }) },
    ...(brand && { icons: { icon: iconOf(brand) } }),
    robots: { index: false, follow: false },
  };
}

/** A share link's page, for people without an account. Everything it shows comes from /api/v1/shared/{token}. */
export default async function SharePage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const asset = Array.isArray(sp.asset) ? sp.asset[0] : sp.asset;
  return <SharedView token={token} initial={await first(token)} asset={asset ?? null} privacy={env.PRIVACY_URL ?? null} />;
}
