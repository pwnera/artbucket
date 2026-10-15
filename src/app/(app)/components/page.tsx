import type { Metadata } from "next";
import { Components } from "@/components/components-page";
import type { ComponentRow } from "@/lib/core/components";
import { get } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Components" };

/** What the project's Storybooks document, from /api/v1/components like any client's. */
export default async function ComponentsPage() {
  const rows = await get("components", (b: { data: (Omit<ComponentRow, "createdAt"> & { createdAt: string })[] }) => b.data, null);
  return <Components rows={rows} />;
}
