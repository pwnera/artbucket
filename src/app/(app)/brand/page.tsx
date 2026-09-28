import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandEditor } from "@/components/brand-editor";
import { contextLabel, type Rule } from "@/lib/rules";
import { brands, get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ brand?: string; context?: string }> };

/** The tab says which brand, and which context, like a Notion page's title. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { brand: slug, context } = await searchParams;
  // brands() is cached per request: the page below reuses this fetch.
  const brand = (await brands()).find((b) => (slug ? b.slug === slug : b.default));
  if (!brand) return { title: "Guidelines" };
  return { title: `${brand.name} guidelines${context ? ` · ${contextLabel(context)}` : ""}` };
}

/**
 * A brand's guidelines, drawn from /api/v1/brand/rules and /api/v1/brands,
 * fetched over HTTP like any other client. `?brand=` picks the brand; the
 * default one otherwise. Nothing here is authored as a document: the page is
 * the rules, edited in place.
 */
export default async function BrandPage({ searchParams }: Props) {
  const { brand: slug, context } = await searchParams;
  const q = new URLSearchParams();
  if (slug) q.set("brand", slug);
  const [all, rules] = await Promise.all([
    brands(),
    // Every variant, whatever the context: the page resolves a context itself, so switching it is instant.
    get(`brand/rules${q.size ? `?${q}` : ""}`, (b: { data: Rule[]; contexts: string[] }) => b, null),
    // The layout's session check does not rerun on a soft navigation: a lapsed session goes to /login, not a 404.
    whoami(),
  ]);
  const brand = all.find((b) => (slug ? b.slug === slug : b.default));
  if (!brand || !rules) notFound();
  const { data, contexts } = rules;
  // Remount per brand only: a context is a view of the same rules.
  return <BrandEditor key={brand.slug} brand={brand} initial={data} contexts={contexts} initialContext={context} />;
}
