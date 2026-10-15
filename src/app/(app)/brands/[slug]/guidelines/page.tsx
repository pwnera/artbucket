import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BrandReader } from "@/components/site/brand-reader";
import { brandHead } from "@/lib/brand-head";
import { env } from "@/lib/env";
import { gitLink } from "@/lib/git";
import { can } from "@/lib/permissions";
import { shownVersion } from "@/lib/readiness";
import { contextLabel } from "@/lib/rules";
import { getBody, whoami } from "@/lib/sidebar";
import { formerBuilderPath, guidelinesPath, type PageView } from "@/lib/site";

export const dynamic = "force-dynamic";

type Query = { page?: string; context?: string; lang?: string; version?: string; focus?: string; panel?: string; git?: string; ways?: string };
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Query> };

/** One page's view as its readers get it (GET /api/v1/brands/{slug}/view). */
async function viewOf(slug: string, { page = "", context = "", lang = "", version = "" }: Query) {
  const q = new URLSearchParams(Object.entries({ page, context, lang, version: version === "live" ? version : "" }).filter(([, v]) => v));
  return (await getBody<{ data?: PageView }>(`brands/${encodeURIComponent(slug)}/view${q.size ? `?${q}` : ""}`))?.data ?? null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const [head, read] = await Promise.all([brandHead(slug), viewOf(slug, { ...q, version: undefined })]);
  if (!head) return { title: "Guidelines" };
  return { title: `${read?.page ? `${read.page.title} · ` : ""}${head.brand.name} guidelines${q.context ? ` · ${contextLabel(q.context)}` : ""}` };
}

/**
 * A brand's Guidelines tab: its pages as its readers see them, read-only,
 * under the brand's header and tabs; `?focus=1`, the same pages alone, the
 * app's sidebar folded. For editors, Edit opens the ways to change the pages
 * (`?ways=1`: an agent, Git, Eject to code), and Comments the review threads
 * (`?comments=1`). The draft or the live release, as lib/readiness.ts
 * shownVersion picks. This was the builder's address once, so an editor's
 * `?git=` or `?panel=` goes where that work is now; proxy.ts sends /pages and
 * ?view=read here.
 */
export default async function GuidelinesPage({ params, searchParams }: Props) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const [head, me] = await Promise.all([brandHead(slug), whoami()]);
  if (!head) notFound();
  const edit = can(me, "brand.edit", head.brand);
  if (edit && (q.git || q.panel)) redirect(formerBuilderPath(slug, q));
  const version = shownVersion(q.version, { edit, publish: head.status?.publish ?? "never", live: head.status?.live ?? null });
  const read = await viewOf(slug, { ...q, version });
  if (!read) notFound();
  // A slug the page had before a rename: its address now.
  if (read.redirect) redirect(guidelinesPath(slug, { ...q, page: read.redirect }));
  const { brand, rules, status, release } = head;
  return (
    <BrandReader
      key={slug}
      initial={read}
      brand={brand}
      embed={q.focus === "1" ? undefined : { head: { brand, origin: env.APP_URL, rules, status, release } }}
      status={status}
      version={version}
      ways={edit ? { mcp: `${env.APP_URL}/api/v1/mcp`, git: env.GIT_CONNECT_URL ? gitLink(env.GIT_CONNECT_URL, slug) : null } : undefined}
    />
  );
}
