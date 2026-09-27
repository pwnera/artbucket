import { redirect } from "next/navigation";
import type { FieldDef } from "@/lib/fields";
import { Gallery, type Listing } from "@/components/gallery";
import { get, sidebarData } from "@/lib/sidebar";
import { parseView, viewQuery } from "@/lib/view";

export const dynamic = "force-dynamic";

/**
 * The initial list comes from the public API over real HTTP, exactly as any
 * other client would fetch it. That keeps the API honest: there is no private
 * server-only path into the data. The URL is the view (lib/view.ts), so a
 * link to a collection, a search or an asset opens on it.
 */
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) params.append(k, x);
  // Custom fields moved into Settings; old links still land there.
  if (params.has("fields")) redirect("/settings/workspace/fields");
  const query = viewQuery(parseView(params), false);
  const empty: Listing = { data: [], total: 0, facets: { tags: [] } };
  const [initial, fields, sidebar] = await Promise.all([
    get(`assets?${query}`, (b: Listing) => b, empty),
    get("fields", (b: { data: FieldDef[] }) => b.data, []),
    sidebarData(),
  ]);
  return <Gallery initial={initial} fields={fields} sidebar={sidebar} />;
}
