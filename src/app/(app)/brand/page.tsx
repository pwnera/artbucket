import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { Builder } from "@/components/builder/builder";
import { GitReturn } from "@/components/git-return";
import { AppHeader } from "@/components/page";
import { BrandReader } from "@/components/site/brand-reader";
import type { NavEntry } from "@/lib/builder-ops";
import { can } from "@/lib/permissions";
import { contextLabel, type Rule } from "@/lib/rules";
import { brands, get, getBody, whoami } from "@/lib/sidebar";
import type { PageView, ViewRule } from "@/lib/site";

export const dynamic = "force-dynamic";

type Query = { brand?: string; context?: string; view?: string; page?: string; lang?: string; panel?: string };
type Props = { searchParams: Promise<Query> };

/** The builder's panels a link may open (`?panel=`). */
const PANELS = ["rules", "history", "tokens", "publish"] as const;

/** The brand `?brand=` names, else the default one. */
const pick = async (slug?: string) => (await brands()).find((b) => (slug ? b.slug === slug : b.default));

/** One page's view as its readers get it, once per request: the title and the page both read it. */
const viewOf = cache(async (brand: string, page = "", context = "", lang = "") => {
  const q = new URLSearchParams(Object.entries({ page, context, lang }).filter(([, v]) => v));
  return (await getBody<{ data?: PageView }>(`brands/${encodeURIComponent(brand)}/view${q.size ? `?${q}` : ""}`))?.data ?? null;
});

/**
 * A rule as the builder holds it, from GET /brand/rules: described as the
 * page's view describes it when the page shows it, else from the rule's own
 * asset rows. ponytail: those carry no size, so a file list off the first
 * page reads 0 B until builder-ops load() takes rules from each view.
 */
function viewRule(r: Rule, shown: Map<string, ViewRule>): ViewRule {
  return (
    shown.get(`${r.key}@${r.context ?? ""}`) ?? {
      key: r.key,
      context: r.context,
      type: r.type,
      label: r.label ?? null,
      value: r.value,
      usage: r.usage,
      spec: r.spec ?? null,
      assets: r.assets.map((a) => ({
        ...a,
        title: a.title ?? null,
        filename: a.filename ?? "",
        mime: a.mime ?? "",
        size: 0,
        preview: !!a.preview,
        supersededBy: null,
      })),
    }
  );
}

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
 * A brand's guidelines, fetched over HTTP like any other client. `?brand=`
 * picks the brand; the default one otherwise. Whoever may edit it gets the
 * builder on `?page=` (the first page without one), loaded here so the
 * canvas draws on the first paint. `?view=read`, and anyone who may only
 * read, gets the brand's pages as its readers see them.
 */
export default async function BrandPage({ searchParams }: Props) {
  const { brand: slug, context, view, page, lang, panel } = await searchParams;
  const [brand, me] = await Promise.all([pick(slug), whoami()]);
  if (!brand) notFound();

  if (view === "read" || !can(me, "brand.edit")) {
    const read = await viewOf(brand.slug, page, context, lang);
    if (!read) notFound();
    // A slug the page had before a rename: its address now.
    if (read.redirect) {
      const q = new URLSearchParams({ brand: brand.slug, ...(view && { view }), page: read.redirect, ...(context && { context }), ...(lang && { lang }) });
      redirect(`/brand?${q}`);
    }
    // Remount per brand only: another page or context is a view of the same site.
    return <BrandReader key={brand.slug} initial={read} />;
  }

  const b = encodeURIComponent(brand.slug);
  const q = new URLSearchParams({ ...(page && { page }), ...(context && { context }), edit: "1" });
  const [pages, edit, rules] = await Promise.all([
    get(`brands/${b}/pages`, (x: { data: (NavEntry & { sections: number })[] }) => x.data, null),
    getBody<{ data?: PageView }>(`brands/${b}/view?${q}`),
    // Every rule and version, whatever the context: the builder resolves a context itself, so switching it is instant.
    get(`brand/rules?brand=${b}`, (x: { data: Rule[] }) => x.data, null),
  ]);
  const shown = edit?.data;
  if (!pages || !shown || !rules) notFound();
  if (shown.redirect) redirect(`/brand?${new URLSearchParams({ brand: brand.slug, page: shown.redirect, ...(context && { context }) })}`);

  const described = new Map(shown.rules.map((r) => [`${r.key}@${r.context ?? ""}`, r]));
  const init = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    nav: pages.map(({ sections: _, ...p }) => p),
    view: shown,
    rules: rules.map((r) => viewRule(r, described)),
    theme: shown.theme.settings,
  };
  // Remount per brand only: another page is a view of the same book, and the builder opens it itself.
  return (
    <>
      <Builder
        key={brand.slug}
        brand={brand.slug}
        init={init}
        panel={PANELS.find((p) => p === panel)}
        header={<AppHeader trail={[{ label: `${brand.name} guidelines` }]} />}
      />
      <GitReturn brand={brand.slug} />
    </>
  );
}
