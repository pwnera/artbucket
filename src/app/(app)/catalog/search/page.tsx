import type { Metadata } from "next";
import { CatalogSearch, type Results } from "@/components/catalog-search";
import { get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search the catalog" };

/** Catalog search: GET /api/v1/catalog with the query as typed, and the type and project picked to refine it. */
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; project?: string }> }) {
  const [, { q = "", type, project }] = await Promise.all([whoami(), searchParams]);
  const params = new URLSearchParams({ q, limit: "60" });
  if (type) params.set("type", type);
  if (project) params.set("project", project);
  const results = q || type || project ? await get(`catalog?${params}`, (b: Results) => b, null) : null;
  return <CatalogSearch q={q} type={type ?? null} project={project ?? null} results={results} />;
}
