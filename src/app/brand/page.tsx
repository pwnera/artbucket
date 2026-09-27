import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandEditor } from "@/components/brand-editor";
import type { BrandInfo } from "@/components/brand-switcher";
import { env } from "@/lib/env";
import type { Rule } from "@/lib/rules";
import { sidebarData } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Guidelines - Artbucket" };

/**
 * A brand's guidelines, drawn from /api/v1/brand/rules and /api/v1/brands,
 * fetched over HTTP like any other client. `?brand=` picks the brand; the
 * default one otherwise. Nothing here is authored as a document: the page is
 * the rules, edited in place.
 */
export default async function BrandPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; context?: string }>;
}) {
  const { brand: slug, context } = await searchParams;
  const get = (path: string) => fetch(`${env.APP_URL}/api/v1/${path}`, { cache: "no-store" });
  const q = new URLSearchParams();
  if (slug) q.set("brand", slug);
  if (context) q.set("context", context);
  const [brandsRes, rulesRes, sidebar] = await Promise.all([
    get("brands"),
    get(`brand/rules${q.size ? `?${q}` : ""}`),
    sidebarData(),
  ]);
  const brands: BrandInfo[] = brandsRes.ok ? (await brandsRes.json()).data : [];
  const brand = brands.find((b) => (slug ? b.slug === slug : b.default));
  if (!brand || !rulesRes.ok) notFound();
  const { data, contexts }: { data: Rule[]; contexts: string[] } = await rulesRes.json();
  // Remount per brand and context: each view starts from what the server resolved.
  return (
    <BrandEditor
      key={`${brand.slug}/${context ?? ""}`}
      brand={brand}
      sidebar={sidebar}
      initial={data}
      contexts={contexts}
      context={context}
    />
  );
}
