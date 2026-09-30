import { notFound, redirect } from "next/navigation";
import { brands } from "@/lib/sidebar";
import { guidelinesPath } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Where the guidelines were, kept so old links, bookmarks and agents'
 * answers still land: /brand alone is the default brand's guidelines, which
 * the places that know no brand link (G G, ⌘K's Guidelines). With ?brand=,
 * proxy.ts has sent it on before this renders, #hash and all; a client-side
 * navigation lands here instead. Every other parameter (page, view, context,
 * lang, git) goes along. Temporary: the default can change.
 */
export default async function OldBrandPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { brand: slug, ...rest } = await searchParams;
  const brand = (await brands()).find((b) => (typeof slug === "string" ? b.slug === slug : b.default));
  if (!brand) notFound();
  redirect(guidelinesPath(brand.slug, Object.fromEntries(Object.entries(rest).filter((e): e is [string, string] => typeof e[1] === "string"))));
}
