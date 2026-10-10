import type { Metadata } from "next";
import { CollectionsPage } from "@/components/collections-page";
import { whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Collections" };

/** The project's collections: the shell holds them (GET /api/v1/collections), as the sidebar once listed them. */
export default async function Collections() {
  await whoami();
  return <CollectionsPage />;
}
