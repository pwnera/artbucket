import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ObjectPage, type Described, type Tab, type TreeProject } from "@/components/catalog";
import { brandPath } from "@/lib/site";
import { get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> };

const TABS: Tab[] = ["overview", "lineage", "access", "activity"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const o = await get(`catalog/${encodeURIComponent((await params).id)}`, (b: Described) => b, null);
  return { title: o?.name ?? "Not found" };
}

/**
 * Any object of the catalog, by id or address: brands in their own pages
 * (their tabs carry Lineage, Access and Activity), an asset's overview in
 * its viewer over Explore, the rest here.
 */
export default async function ObjectRoute({ params, searchParams }: Props) {
  const [, { id }, { tab: asked }] = await Promise.all([whoami(), params, searchParams]);
  const object = await get(`catalog/${encodeURIComponent(id)}`, (b: Described) => b, null);
  if (!object) notFound();
  const tab = TABS.includes(asked as Tab) ? (asked as Tab) : "overview";
  const brand = object.type === "brand" ? object.slug : object.parent?.type === "brand" ? object.parent.slug : null;
  if (brand && object.type === "brand") redirect(brandPath(brand, tab === "overview" ? "" : `/${tab}`));
  if (object.type !== "collection" && object.type !== "portal" && object.type !== "asset") redirect(object.open);
  if (object.type === "asset" && tab === "overview") redirect(object.open);
  const projects = await get("catalog/tree", (b: { projects: TreeProject[] }) => b.projects, [] as TreeProject[]);
  return <ObjectPage object={object} tab={tab} projects={projects} />;
}
