import type { Metadata } from "next";
import { PortalView } from "@/components/portal-view";
import { PRODUCT } from "@/lib/branding";
import { getBody, iconOf } from "@/lib/sidebar";

type Theme = { icon: string | null; product: string };
type Body = { portal?: { name: string; theme: Theme }; error?: { detail?: { name?: string; theme?: Theme } } };

/** Named and iconed as its organization, not as whoever runs the server. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const b = await getBody<Body>(`portal/${(await params).slug}?limit=1`);
  const name = b?.portal?.name ?? b?.error?.detail?.name;
  const theme = b?.portal?.theme ?? b?.error?.detail?.theme;
  return {
    title: name && theme ? { absolute: `${name} - ${theme.product}` } : "Portal",
    ...(theme && { icons: { icon: iconOf({ icon: theme.icon, custom: theme.product !== PRODUCT }) } }),
    robots: { index: false, follow: false },
  };
}

/** A brand portal. Everything it shows comes from /api/v1/portal/{slug}. */
export default async function PortalPage({ params }: { params: Promise<{ slug: string }> }) {
  return <PortalView slug={(await params).slug} />;
}
