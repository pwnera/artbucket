import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Builder } from "@/components/builder/builder";
import { GitReturn } from "@/components/git-return";
import { AppHeader } from "@/components/page";
import type { NavEntry } from "@/lib/builder-ops";
import { can } from "@/lib/permissions";
import { contextLabel, type Rule } from "@/lib/rules";
import { brands, get, getBody, whoami } from "@/lib/sidebar";
import { brandPath, builderPath, guidelinesPath, type PageView, type ViewRule } from "@/lib/site";

export const dynamic = "force-dynamic";

type Query = { context?: string; page?: string; lang?: string; panel?: string };
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Query> };

/** The builder's panels a link may open (`?panel=`). */
const PANELS = ["rules", "history", "tokens", "publish"] as const;

/** The brand the address names. */
const pick = async (slug: string) => (await brands()).find((b) => b.slug === slug);

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

/** The tab says which brand, and which context, like a Notion page's title. */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, { context }] = await Promise.all([params, searchParams]);
  // brands() is cached per request: the page below reuses this fetch.
  const brand = await pick(slug);
  if (!brand) return { title: "Guidelines" };
  return { title: `${brand.name} guidelines${context ? ` · ${contextLabel(context)}` : ""}` };
}

/**
 * A brand's guidelines in the builder, fetched over HTTP like any other
 * client, on `?page=` (the first page without one), loaded here so the
 * canvas draws on the first paint. Whoever may only read goes to the same
 * page in the reader, /brands/{slug}/guidelines, with what the address says.
 */
export default async function GuidelinesEditPage({ params, searchParams }: Props) {
  const [{ slug }, { context, page, lang, panel }] = await Promise.all([params, searchParams]);
  const [brand, me] = await Promise.all([pick(slug), whoami()]);
  if (!brand) notFound();
  if (!can(me, "brand.edit")) redirect(guidelinesPath(brand.slug, { page, context, lang }));

  const b = encodeURIComponent(brand.slug);
  const q = new URLSearchParams({ ...(page && { page }), ...(context && { context }), edit: "1" });
  const [pages, edit, rules] = await Promise.all([
    get(`brands/${b}/pages`, (x: { data: (NavEntry & { sections: number })[] }) => x.data, null),
    getBody<{ data?: PageView }>(`brands/${b}/view?${q}`),
    // Every rule and version, whatever the context: the builder resolves a context itself, so switching it is instant.
    get(`brand/rules?brand=${b}`, (x: { data: Rule[] }) => x.data, null),
  ]);
  const shown = edit?.data;
  // A page that is gone (deleted, or an old link): the book opens on its first page rather than on nothing.
  if (page && !shown && pages) redirect(builderPath(brand.slug, { context }));
  if (!pages || !shown || !rules) notFound();
  if (shown.redirect) redirect(builderPath(brand.slug, { page: shown.redirect, context }));

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
        header={<AppHeader key="header" trail={[{ label: "Brands", href: "/brands" }, { label: brand.name, href: brandPath(brand.slug) }, { label: "Guidelines", href: guidelinesPath(brand.slug) }, { label: "Edit" }]} />}
      />
      <GitReturn brand={brand.slug} />
    </>
  );
}
