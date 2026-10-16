import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HomePage } from "@/components/home-page";
import { get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Home" };

type Latest = { id: string; filename: string; createdAt: string; metadata?: { title?: string } | null };

/**
 * Home: one box that searches everything, a new admin's setup, then brands,
 * collections and assets, lately opened or added (components/explore-start.tsx).
 * The library was here before it moved to /assets: a link to a view of it
 * (/?collection=, /?asset=, /?q=) still lands there, query and all.
 */
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) params.append(k, x);
  if (params.size) redirect(`/assets?${params}`.replace(/=(?=&|$)/g, ""));
  const [latest] = await Promise.all([get("assets?limit=24&facets=false&record=false", (b: { data: Latest[]; total: number }) => b, { data: [], total: 0 }), whoami()]);
  return <HomePage latest={latest.data} stocked={latest.total > 0} />;
}
