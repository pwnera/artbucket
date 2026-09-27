import type { Metadata } from "next";
import { PortalView } from "@/components/portal-view";

export const metadata: Metadata = { title: "Portal", robots: { index: false, follow: false } };

/** A brand portal. Everything it shows comes from /api/v1/portal/{slug}. */
export default async function PortalPage({ params }: { params: Promise<{ slug: string }> }) {
  return <PortalView slug={(await params).slug} />;
}
