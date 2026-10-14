import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { library } from "@/lib/library-page";
import { parseView } from "@/lib/view";

export const dynamic = "force-dynamic";
// The server's title, Assets for the plain grid; the page names the view it shows once it runs (a collection, a search).
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }): Promise<Metadata> {
  return { title: "browse" in (await searchParams) ? "Assets" : "Explore" };
}

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
  // Review is a page of its own now: /?review leads there, with the rest of its query.
  if (parseView(params).review) {
    params.delete("review");
    redirect(params.size ? `/review?${params}` : "/review");
  }
  return library(params, false);
}
