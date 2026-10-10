import type { Metadata } from "next";
import { CatalogExplorer, type Described, type Tab, type TreeProject } from "@/components/catalog";
import { get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Catalog" };

const TABS: Tab[] = ["overview", "lineage", "access", "activity"];

/** The catalog explorer: the tree from /api/v1/catalog/tree, and the object `?o=` names (the first one without). */
export default async function Catalog({ searchParams }: { searchParams: Promise<{ o?: string; tab?: string }> }) {
  const [, { o, tab }] = await Promise.all([whoami(), searchParams]);
  const projects = await get("catalog/tree", (b: { projects: TreeProject[] }) => b.projects, [] as TreeProject[]);
  const ref = o ?? projects.flatMap((p) => p.objects)[0]?.id;
  const object = ref ? await get(`catalog/${encodeURIComponent(ref)}`, (b: Described) => b, null) : null;
  return <CatalogExplorer projects={projects} object={object} tab={TABS.includes(tab as Tab) ? (tab as Tab) : "overview"} />;
}
