import { env } from "@/lib/env";
import type { Collection } from "@/components/collections";
import { Gallery, type Listing } from "@/components/gallery";
import type { FieldDef } from "@/lib/fields";

export const dynamic = "force-dynamic";

/**
 * The initial list comes from the public API over real HTTP, exactly as any
 * other client would fetch it. That keeps the API honest: there is no private
 * server-only path into the data.
 */
export default async function Home() {
  const get = (path: string) => fetch(`${env.APP_URL}/api/v1/${path}`, { cache: "no-store" });
  const [res, fieldsRes, collectionsRes, searchesRes] = await Promise.all([
    get("assets"),
    get("fields"),
    get("collections"),
    get("searches"),
  ]);
  const initial: Listing = res.ok ? await res.json() : { data: [], facets: { tags: [] } };
  const fields: FieldDef[] = fieldsRes.ok ? (await fieldsRes.json()).data : [];
  const collections: Collection[] = collectionsRes.ok ? (await collectionsRes.json()).data : [];

  const searches = searchesRes.ok ? (await searchesRes.json()).data : [];

  return <Gallery initial={initial} fields={fields} collections={collections} searches={searches} />;
}
