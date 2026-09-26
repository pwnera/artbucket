import { env } from "@/lib/env";
import { Gallery, type Listing } from "@/components/gallery";
import type { FieldDef } from "@/lib/fields";

export const dynamic = "force-dynamic";

/**
 * The initial list comes from the public API over real HTTP, exactly as any
 * other client would fetch it. That keeps the API honest: there is no private
 * server-only path into the data.
 */
export default async function Home() {
  const [res, fieldsRes] = await Promise.all([
    fetch(`${env.APP_URL}/api/v1/assets`, { cache: "no-store" }),
    fetch(`${env.APP_URL}/api/v1/fields`, { cache: "no-store" }),
  ]);
  const initial: Listing = res.ok ? await res.json() : { data: [], facets: { tags: [] } };
  const fields: FieldDef[] = fieldsRes.ok ? (await fieldsRes.json()).data : [];

  return <Gallery initial={initial} fields={fields} />;
}
