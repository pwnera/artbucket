import { env } from "@/lib/env";
import { Gallery, type Asset } from "@/components/gallery";

export const dynamic = "force-dynamic";

/**
 * The initial list comes from the public API over real HTTP, exactly as any
 * other client would fetch it. That keeps the API honest: there is no private
 * server-only path into the data.
 */
export default async function Home() {
  const res = await fetch(`${env.APP_URL}/api/v1/assets`, { cache: "no-store" });
  const initial: Asset[] = res.ok ? (await res.json()).data : [];

  return <Gallery initial={initial} />;
}
