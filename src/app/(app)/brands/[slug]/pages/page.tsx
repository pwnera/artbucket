import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BrandReader } from "@/components/site/brand-reader";
import { brandHead } from "@/lib/brand-head";
import { env } from "@/lib/env";
import { contextLabel } from "@/lib/rules";
import { getBody } from "@/lib/sidebar";
import { brandPath, type PageView } from "@/lib/site";

export const dynamic = "force-dynamic";

type Query = { page?: string; context?: string; lang?: string };
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Query> };

/** One page's view as its readers get it (GET /api/v1/brands/{slug}/view). */
async function viewOf(slug: string, { page = "", context = "", lang = "" }: Query) {
  const q = new URLSearchParams(Object.entries({ page, context, lang }).filter(([, v]) => v));
  return (await getBody<{ data?: PageView }>(`brands/${encodeURIComponent(slug)}/view${q.size ? `?${q}` : ""}`))?.data ?? null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const [head, read] = await Promise.all([brandHead(slug), viewOf(slug, q)]);
  if (!head) return { title: "Guidelines" };
  return { title: `${read?.page ? `${read.page.title} · ` : ""}${head.brand.name} guidelines${q.context ? ` · ${contextLabel(q.context)}` : ""}` };
}

/**
 * A brand's Guidelines tab: its pages as its readers see them, read-only,
 * under the brand's header and tabs. Edit, in the header, opens the builder
 * at /brands/{slug}/guidelines; ?view=read there is the same reader on its own.
 */
export default async function BrandPagesPage({ params, searchParams }: Props) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const [head, read] = await Promise.all([brandHead(slug), viewOf(slug, q)]);
  if (!head || !read) notFound();
  const path = brandPath(slug, "/pages");
  // A slug the page had before a rename: its address now.
  if (read.redirect) redirect(`${path}?${new URLSearchParams(Object.entries({ ...q, page: read.redirect }).filter((e): e is [string, string] => !!e[1]))}`);
  const { brand, rules, status, release } = head;
  return (
    <BrandReader
      key={slug}
      initial={read}
      embed={{ path, head: { brand, origin: env.APP_URL, rules, hub: status?.hub ?? null, release } }}
    />
  );
}
