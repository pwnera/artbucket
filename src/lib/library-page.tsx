import { cookies } from "next/headers";
import type { FieldDef } from "@/lib/fields";
import { Gallery, type Listing } from "@/components/gallery";
import { get, whoami } from "@/lib/sidebar";
import { parseView, viewQuery } from "@/lib/view";

/** Explore, or Review (`review`): the same library, drawn from /api/v1/assets like any client's. */
export async function library(params: URLSearchParams, review: boolean) {
  const view = { ...parseView(params), review: review || parseView(params).review };
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
