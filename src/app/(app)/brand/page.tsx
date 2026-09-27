import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandEditor } from "@/components/brand-editor";
import type { Rule } from "@/lib/rules";
import { get, sidebarData } from "@/lib/sidebar";

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
  const q = new URLSearchParams();
  if (slug) q.set("brand", slug);
  if (context) q.set("context", context);
  const [sidebar, rules] = await Promise.all([
    sidebarData(),
    get(`brand/rules${q.size ? `?${q}` : ""}`, (b: { data: Rule[]; contexts: string[] }) => b, null),
  ]);
  const brand = sidebar.brands.find((b) => (slug ? b.slug === slug : b.default));
  if (!brand || !rules) notFound();
  const { data, contexts } = rules;
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
