import { redirect } from "next/navigation";

/** /portals: portals are sites now, at /sites, with the same query. */
export default async function PortalsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = new URLSearchParams(await searchParams).toString();
  redirect(q ? `/sites?${q}` : "/sites");
}
