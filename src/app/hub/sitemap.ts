import type { MetadataRoute } from "next";
import { hubListings } from "@/lib/core/hub";
import { env } from "@/lib/env";

// Read at request time: HUB_URL is a runtime setting, unset at build, which would freeze an empty sitemap.
export const dynamic = "force-dynamic";

/** The hub's verified listings and their owners, for search engines: community ones stay out, as their pages say. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!env.HUB_URL) return [];
  const cards = (await hubListings({ limit: 200 })).filter((c) => c.verified);
  const owners = [...new Set(cards.map((c) => c.org))];
  return [
    { url: env.HUB_URL, changeFrequency: "daily" },
    { url: `${env.HUB_URL}/score` },
    ...owners.map((o) => ({ url: `${env.HUB_URL}/${o}` })),
    ...cards.map((c) => ({ url: env.HUB_URL + c.path, lastModified: c.publishedAt ?? undefined })),
  ];
}
