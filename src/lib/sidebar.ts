import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { BrandInfo } from "@/components/brand-switcher";
import type { Collection } from "@/components/collections";
import type { SavedSearch } from "@/components/app-sidebar";
import type { Me } from "@/components/account";
import { env } from "@/lib/env";
import { can } from "@/lib/permissions";

export type SidebarData = {
  collections: Collection[];
  brands: BrandInfo[];
  searches: SavedSearch[];
  /** What waits in Review. */
  reviewCount: number;
  me: Me;
};

/**
 * GET /api/v1/{path}, over HTTP like any other client, as the person looking:
 * their session and workspace ride along in the cookies. `fallback` when it
 * fails.
 */
export async function get<B, T>(path: string, pick: (body: B) => T, fallback: T): Promise<T> {
  const cookie = (await headers()).get("cookie");
  const res = await fetch(`${env.APP_URL}/api/v1/${path}`, { cache: "no-store", headers: cookie ? { cookie } : {} });
  return res.ok ? pick((await res.json()) as B) : fallback;
}

/**
 * Who is looking, once per request however many ask. Nobody who may see
 * nothing goes to sign in; somebody signed in with nowhere to be goes to
 * /welcome.
 */
export const whoami = cache(async (): Promise<Me> => {
  const me = await get("me", (b: { data: Me }) => b.data, null);
  if (!me) redirect("/login");
  if (!can(me, "library.read")) redirect(me.user ? "/welcome" : "/login");
  return me;
});

/** What every page's sidebar shows, so it reads the same wherever you are. */
export async function sidebarData(): Promise<SidebarData> {
  const me = await whoami();
  const data = <T,>(b: { data: T }) => b.data;
  const [collections, brands, searches, reviewCount] = await Promise.all([
    get("collections", data<Collection[]>, []),
    get("brands", data<BrandInfo[]>, []),
    get("searches", data<SavedSearch[]>, []),
    get("assets?review=true&limit=1", (b: { total: number }) => b.total, 0),
  ]);
  return { collections, brands, searches, reviewCount, me };
}
