import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { BrandInfo } from "@/components/brand-switcher";
import type { Collection } from "@/components/collections";
import type { SavedSearch } from "@/components/app-sidebar";
import type { Me } from "@/components/account";
import { DEFAULT_BRAND, type Brand } from "@/lib/branding";
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
  const h = await headers();
  const cookie = h.get("cookie");
  // The host asked for, so an organization's own domain gets its brand (lib/core/branding.ts).
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const res = await fetch(`${env.APP_URL}/api/v1/${path}`, {
    cache: "no-store",
    headers: { ...(cookie && { cookie }), ...(host && { "x-forwarded-host": host }) },
  });
  return res.ok ? pick((await res.json()) as B) : fallback;
}

/**
 * Who is looking, once per request however many ask. Before the first
 * account exists, everyone goes to make it; after, nobody who may see
 * nothing goes to sign in, and somebody signed in with nowhere to be goes
 * to /welcome.
 */
/** GET /api/v1/{path}'s body whatever its status, or null: for pages that read an error's detail. */
export async function getBody<B>(path: string): Promise<B | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const cookie = h.get("cookie");
  const res = await fetch(`${env.APP_URL}/api/v1/${path}`, {
    cache: "no-store",
    headers: { ...(cookie && { cookie }), ...(host && { "x-forwarded-host": host }) },
  }).catch(() => null);
  return res ? ((await res.json().catch(() => null)) as B | null) : null;
}

/** A tab icon: the brand's, none for a brand without one (never the product's), else the product's. */
export const iconOf = (b: Pick<Brand, "icon" | "custom">) => b.icon ?? (b.custom ? "data:," : "/icon.svg");

/** The brand this page is seen in, once per request. */
export const brand = cache(() => get("branding", (b: { data: Brand }) => b.data, DEFAULT_BRAND));

export const whoami = cache(async (): Promise<Me> => {
  const me = await get("me", (b: { data: Me }) => b.data, null);
  // No account yet: making the first one is the only thing to do.
  if (!me || me.auth.signUp) redirect("/login");
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
