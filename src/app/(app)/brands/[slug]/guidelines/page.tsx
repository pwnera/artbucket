import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { Builder } from "@/components/builder/builder";
import { GitReturn } from "@/components/git-return";
import { AppHeader } from "@/components/page";
import { BrandReader } from "@/components/site/brand-reader";
import { brandHead } from "@/lib/brand-head";
import type { NavEntry } from "@/lib/builder-ops";
import { can } from "@/lib/permissions";
import { shownVersion } from "@/lib/readiness";
import { contextLabel, type Rule } from "@/lib/rules";
import { brands, get, getBody, whoami } from "@/lib/sidebar";
import { brandPath, guidelinesPath, type PageView, type ViewRule } from "@/lib/site";

export const dynamic = "force-dynamic";

type Query = { context?: string; view?: string; page?: string; lang?: string; panel?: string; version?: string };
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Query> };

/** The builder's panels a link may open (`?panel=`). */
const PANELS = ["rules", "history", "tokens", "publish"] as const;

/** The brand the address names. */
const pick = async (slug: string) => (await brands()).find((b) => b.slug === slug);

/** One page's view as its readers get it, once per request: the title and the page both read it. */
const viewOf = cache(async (brand: string, page = "", context = "", lang = "", version = "") => {
  const q = new URLSearchParams(Object.entries({ page, context, lang, version: version === "live" ? version : "" }).filter(([, v]) => v));
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
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, { context, view, page, lang }] = await Promise.all([params, searchParams]);
  // brands() is cached per request: the page below reuses this fetch.
  const brand = await pick(slug);
  if (!brand) return { title: "Guidelines" };
  const read = view === "read" ? await viewOf(brand.slug, page, context, lang) : null;
  return { title: `${read?.page ? `${read.page.title} · ` : ""}${brand.name} guidelines${context ? ` · ${contextLabel(context)}` : ""}` };
}

/**
 * A brand's guidelines, its Guidelines tab, fetched over HTTP like any other
 * client. /brand?brand= comes here (app/(app)/brand). Whoever may edit it gets the
 * builder on `?page=` (the first page without one), loaded here so the
 * canvas draws on the first paint. `?view=read`, and anyone who may only
 * read, gets the brand's pages as its readers see them.
 */
export default async function GuidelinesPage({ params, searchParams }: Props) {
  const [{ slug }, { context, view, page, lang, panel, version: asked }] = await Promise.all([params, searchParams]);
  const [brand, me] = await Promise.all([pick(slug), whoami()]);
  if (!brand) notFound();

  if (view === "read" || !can(me, "brand.edit")) {
    const status = (await brandHead(brand.slug))?.status ?? null;
    const version = shownVersion(asked, { edit: can(me, "brand.edit"), publish: status?.publish ?? "never", live: status?.live ?? null });
    const read = await viewOf(brand.slug, page, context, lang, version);
    if (!read) notFound();
    // A slug the page had before a rename: its address now.
    if (read.redirect) {
      redirect(guidelinesPath(brand.slug, { view, page: read.redirect, context, lang, version: asked }));
    }
    // Remount per brand only: another page or context is a view of the same site.
    return <BrandReader key={brand.slug} initial={read} status={status} version={version} />;
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
  if (shown.redirect) redirect(guidelinesPath(brand.slug, { page: shown.redirect, context }));

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
        header={<AppHeader trail={[{ label: "Brands", href: "/brands" }, { label: brand.name, href: brandPath(brand.slug) }, { label: "Guidelines" }]} />}
      />
      <GitReturn brand={brand.slug} />
    </>
  );
}
