import { notFound, redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { brands, whoami } from "@/lib/sidebar";
import { formerBuilderPath, guidelinesPath } from "@/lib/site";

export const dynamic = "force-dynamic";

type Query = { context?: string; page?: string; lang?: string; panel?: string; git?: string };
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Query> };

/**
 * The retired guidelines builder's address, kept for the links, bookmarks
 * and agents' answers that still name it: an editor goes where that work is
 * now (lib/site.ts formerBuilderPath), whoever may only read to the same
 * page in the reader.
 */
export default async function GuidelinesEditPage({ params, searchParams }: Props) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const [all, me] = await Promise.all([brands(), whoami()]);
  const brand = all.find((b) => b.slug === slug);
  if (!brand) notFound();
  redirect(can(me, "brand.edit", brand) ? formerBuilderPath(brand.slug, q) : guidelinesPath(brand.slug, { page: q.page, context: q.context, lang: q.lang }));
}
