import type { Metadata } from "next";
import { CatalogExplorer, type Described, type Tab, type TreeProject } from "@/components/catalog";
import { get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Catalog" };

const TABS: Tab[] = ["overview", "lineage", "access", "activity"];

/**
 * The catalog explorer: the tree from /api/v1/catalog/tree, and the object
 * `?o=` names or the folder `?f=` does (a tree key: a project, a type's
 * folder...). Neither: the project open, as a folder.
 */
export default async function Catalog({ searchParams }: { searchParams: Promise<{ o?: string; f?: string; tab?: string }> }) {
  const [me, { o, f, tab }] = await Promise.all([whoami(), searchParams]);
  const projects = await get("catalog/tree", (b: { projects: TreeProject[] }) => b.projects, [] as TreeProject[]);
  const folder = o ? null : (f ?? (projects.find((p) => p.id === me?.project.id) ?? projects[0])?.id ?? null);
  const object = o ? await get(`catalog/${encodeURIComponent(o)}`, (b: Described) => b, null) : null;
  return <CatalogExplorer projects={projects} object={object} folder={folder} tab={TABS.includes(tab as Tab) ? (tab as Tab) : "overview"} />;
}
