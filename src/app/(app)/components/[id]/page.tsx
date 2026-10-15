import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComponentPage } from "@/components/components-page";
import { get } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Component" };

/** One component's versions, from /api/v1/components/{id} like any client's. */
export default async function ComponentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await get(`components/${encodeURIComponent(id)}`, (b: { data: Parameters<typeof ComponentPage>[0]["c"] }) => b.data, null);
  if (!c) notFound();
  return <ComponentPage c={c} />;
}
