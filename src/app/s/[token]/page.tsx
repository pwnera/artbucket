import type { Metadata } from "next";
import { SharedView } from "@/components/shared-view";
import type { Brand } from "@/lib/branding";
import { getBody, iconOf } from "@/lib/sidebar";

type Body = { share?: { brand: Brand }; error?: { detail?: { brand?: Brand } } };

/** In the brand of the organization that shared it, not the visitor's. */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const b = await getBody<Body>(`shared/${(await params).token}?limit=1`);
  const brand = b?.share?.brand ?? b?.error?.detail?.brand;
  return {
    title: brand ? { absolute: `Shared - ${brand.name}` } : "Shared",
    ...(brand && { icons: { icon: iconOf(brand) } }),
    robots: { index: false, follow: false },
  };
}

/** A share link's page, for people without an account. Everything it shows comes from /api/v1/shared/{token}. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  return <SharedView token={(await params).token} />;
}
