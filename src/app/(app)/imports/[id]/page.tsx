import type { Metadata } from "next";
import { BrandImportPage } from "@/components/brand-import-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Brand import" };

/** One brand import: read in the background, then its plan to review and apply (components/brand-import-page.tsx). */
export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BrandImportPage id={id} />;
}
