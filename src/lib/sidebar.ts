import type { BrandInfo } from "@/components/brand-switcher";
import type { Collection } from "@/components/collections";
import type { SavedSearch } from "@/components/app-sidebar";
import { env } from "@/lib/env";

export type SidebarData = {
  collections: Collection[];
  brands: BrandInfo[];
  searches: SavedSearch[];
  /** What waits in Review. */
  reviewCount: number;
};

/** GET /api/v1/{path}, over HTTP like any other client; `fallback` when it fails. */
export async function get<B, T>(path: string, pick: (body: B) => T, fallback: T): Promise<T> {
  const res = await fetch(`${env.APP_URL}/api/v1/${path}`, { cache: "no-store" });
  return res.ok ? pick((await res.json()) as B) : fallback;
}

/** What every page's sidebar shows, so it reads the same wherever you are. */
export async function sidebarData(): Promise<SidebarData> {
  const data = <T,>(b: { data: T }) => b.data;
  const [collections, brands, searches, reviewCount] = await Promise.all([
    get("collections", data<Collection[]>, []),
    get("brands", data<BrandInfo[]>, []),
    get("searches", data<SavedSearch[]>, []),
    get("assets?review=true&limit=1", (b: { total: number }) => b.total, 0),
  ]);
  return { collections, brands, searches, reviewCount };
}
