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
  const res = await fetch(`${env.INTERNAL_URL ?? env.APP_URL}/api/v1/${path}`, {
    cache: "no-store",
    headers: { ...(cookie && { cookie }), ...(host && { "x-forwarded-host": host }) },
  });
  return res.ok ? pick((await res.json()) as B) : fallback;
}

/** GET /api/v1/{path}'s body whatever its status, or null: for pages that read an error's detail. */
export async function getBody<B>(path: string, extra?: Record<string, string>): Promise<B | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const cookie = h.get("cookie");
  const res = await fetch(`${env.INTERNAL_URL ?? env.APP_URL}/api/v1/${path}`, {
    cache: "no-store",
    headers: { ...extra, ...(cookie && { cookie }), ...(host && { "x-forwarded-host": host }) },
  }).catch(() => null);
  return res ? ((await res.json().catch(() => null)) as B | null) : null;
}

/** A tab icon: the brand's, none for a brand without one (never the product's), else the product's. */
export const iconOf = (b: Pick<Brand, "icon" | "custom">) => b.icon ?? (b.custom ? "data:," : "/icon.svg");

/** The brand this page is seen in, once per request. The root layout awaits it: an API that doesn't answer gets the product's own look, not a crash. */
export const brand = cache(() => get("branding", (b: { data: Brand }) => b.data, DEFAULT_BRAND).catch(() => DEFAULT_BRAND));

/**
 * Who is looking, once per request however many ask. Before the first
 * account exists, everyone goes to make it; after, nobody who may see
 * nothing goes to sign in, and somebody signed in with nowhere to be goes
 * to /welcome.
 */
export const whoami = cache(async (): Promise<Me> => {
  const me = await get("me", (b: { data: Me }) => b.data, null);
  // No account yet: making the first one is the only thing to do.
  if (me?.auth.signUp) redirect("/login");
  // Back to this very page after signing in (proxy.ts forwards its address).
  const path = (await headers()).get("x-path");
  const signIn = path && path !== "/" ? `/login?next=${encodeURIComponent(path)}` : "/login";
  if (!me) redirect(signIn);
  if (!can(me, "library.read")) redirect(me.user ? "/welcome" : signIn);
  return me;
});

const data = <T,>(b: { data: T }) => b.data;

/** Every brand, once per request: the sidebar lists them and the brand page looks one up. */
export const brands = cache(() => get("brands", data<BrandInfo[]>, []));

/**
 * What the sidebar shows, once per request. The (app) layout reads it for the
 * shell (components/shell.tsx), so it loads on a full page load or a
 * router.refresh, not on every navigation.
 */
export const sidebarData = cache(async (): Promise<SidebarData> => {
  // Alongside who is looking, not after: none of these needs it, and a redirect from whoami still wins.
  const [me, collections, brandList, searches, reviewCount] = await Promise.all([
    whoami(),
    get("collections", data<Collection[]>, []),
    brands(),
    get("searches", data<SavedSearch[]>, []),
    get("assets?review=true&limit=1", (b: { total: number }) => b.total, 0),
  ]);
  return { collections, brands: brandList, searches, reviewCount, me };
});
