import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Builder } from "@/components/builder/builder";
import { GitReturn } from "@/components/git-return";
import { AppHeader } from "@/components/page";
import { env } from "@/lib/env";
import { can } from "@/lib/permissions";
import { builderInit } from "@/lib/builder-init";
import { contextLabel } from "@/lib/rules";
import { brands, whoami } from "@/lib/sidebar";
import { brandPath, builderPath, guidelinesPath } from "@/lib/site";

export const dynamic = "force-dynamic";

type Query = { context?: string; page?: string; lang?: string; panel?: string };
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Query> };

/** The builder's panels a link may open (`?panel=`). */
const PANELS = ["rules", "history", "tokens", "publish"] as const;

/** Where each panel's work is on the brand, when the builder is read-only. */
const ON_THE_BRAND: Record<(typeof PANELS)[number], string> = { rules: "/rules", history: "/releases", tokens: "/theme", publish: "" };

/** The brand the address names. */
const pick = async (slug: string) => (await brands()).find((b) => b.slug === slug);

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
  if (env.BUILDER === "read-only") readOnly(brand.slug, { page, context, lang }, PANELS.find((p) => p === panel));

  const got = await builderInit(brand.slug, { page, context });
  // A page that is gone (deleted, or an old link): the book opens on its first page rather than on nothing.
  if (page && got && !got.shown) redirect(builderPath(brand.slug, { context }));
  if (!got?.shown || !got.init) notFound();
  if (got.shown.redirect) redirect(builderPath(brand.slug, { page: got.shown.redirect, context }));
  const { init } = got;
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

/**
 * The builder, read-only (BUILDER=read-only): the pages as readers see them,
 * with the three ways to change them open over them (`?ways=1`). A link to
 * one of its panels goes where that work is now, on the brand.
 */
function readOnly(slug: string, q: { page?: string; context?: string; lang?: string }, panel?: (typeof PANELS)[number]): never {
  redirect(panel ? brandPath(slug, ON_THE_BRAND[panel]) : guidelinesPath(slug, { ...q, ways: "1" }));
}
