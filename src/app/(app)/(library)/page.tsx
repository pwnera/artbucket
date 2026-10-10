import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { FieldDef } from "@/lib/fields";
import { Gallery, type Listing } from "@/components/gallery";
import { get, whoami } from "@/lib/sidebar";
import { parseView, viewQuery } from "@/lib/view";

export const dynamic = "force-dynamic";
// The server's title; the page names the view it shows once it runs (a collection, a search).
export const metadata: Metadata = { title: "Assets" };

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
  if (params.has("fields")) redirect("/settings/project/fields");
  const view = parseView(params);
  const query = viewQuery(view, false);
  const empty: Listing = { data: [], total: 0, facets: { tags: [] } };
  const [initial, fields, jar] = await Promise.all([
    get(`assets?${query}`, (b: Listing) => b, empty),
    get("fields", (b: { data: FieldDef[] }) => b.data, []),
    cookies(),
    // The layout's check does not rerun on a soft navigation: a lapsed session goes to /login, not an empty library.
    whoami(),
  ]);
  // Layout and density are the viewer's; the cookie lets the first paint be theirs, not the default's.
  const layout = jar.get(`artbucket_layout_${view.review ? "review" : "assets"}`)?.value;
  const density = jar.get("artbucket_density")?.value;
  return (
    <Gallery
      initial={initial}
      fields={fields}
      initialLayout={layout === "grid" || layout === "list" ? layout : undefined}
      initialDensity={density === "s" || density === "m" || density === "l" ? density : undefined}
    />
  );
}
