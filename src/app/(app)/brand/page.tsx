import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { BrandEditor } from "@/components/brand-editor";
import { BrandReader } from "@/components/site/brand-reader";
import { contextLabel, type Rule } from "@/lib/rules";
import { brands, get, getBody, whoami } from "@/lib/sidebar";
import type { PageView } from "@/lib/site";

export const dynamic = "force-dynamic";

type Query = { brand?: string; context?: string; view?: string; page?: string; lang?: string };
type Props = { searchParams: Promise<Query> };

/** The brand `?brand=` names, else the default one. */
const pick = async (slug?: string) => (await brands()).find((b) => (slug ? b.slug === slug : b.default));

/** One page's view as its readers get it, once per request: the title and the page both read it. */
const viewOf = cache(async (brand: string, page = "", context = "", lang = "") => {
  const q = new URLSearchParams(Object.entries({ page, context, lang }).filter(([, v]) => v));
  return (await getBody<{ data?: PageView }>(`brands/${encodeURIComponent(brand)}/view${q.size ? `?${q}` : ""}`))?.data ?? null;
});

/** The tab says which brand, and which context, like a Notion page's title; reading, which page too. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { brand: slug, context, view, page, lang } = await searchParams;
  // brands() is cached per request: the page below reuses this fetch.
  const brand = await pick(slug);
  if (!brand) return { title: "Guidelines" };
  const read = view === "read" ? await viewOf(brand.slug, page, context, lang) : null;
  return { title: `${read?.page ? `${read.page.title} · ` : ""}${brand.name} guidelines${context ? ` · ${contextLabel(context)}` : ""}` };
}

/**
 * A brand's guidelines, drawn from /api/v1/brand/rules and /api/v1/brands,
 * fetched over HTTP like any other client. `?brand=` picks the brand; the
 * default one otherwise. Nothing here is authored as a document: the page is
 * the rules, edited in place. `?view=read` shows the brand's pages as its
 * readers see them, one `?page=` at a time.
 */
export default async function BrandPage({ searchParams }: Props) {
  const { brand: slug, context, view, page, lang } = await searchParams;
  if (view === "read") {
    const [brand] = await Promise.all([pick(slug), whoami()]);
    if (!brand) notFound();
    const read = await viewOf(brand.slug, page, context, lang);
    if (!read) notFound();
    // A slug the page had before a rename: its address now.
    if (read.redirect) {
      const q = new URLSearchParams({ brand: brand.slug, view: "read", page: read.redirect, ...(context && { context }), ...(lang && { lang }) });
      redirect(`/brand?${q}`);
    }
    // Remount per brand only: another page or context is a view of the same site.
    return <BrandReader key={brand.slug} initial={read} />;
  }

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
