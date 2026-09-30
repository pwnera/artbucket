import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { PreviewView, type PreviewBody } from "@/components/site/preview-view";
import { getBody } from "@/lib/sidebar";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ token: string; path?: string[] }>; searchParams: Promise<Search> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null;

/** The page asked for, once per request: the metadata and the page share it. */
const first = cache((token: string, page: string | null, context: string | null, lang: string | null) =>
  getBody<PreviewBody>(
    `previews/${encodeURIComponent(token)}?${new URLSearchParams({ ...(page && { page }), ...(context && { context }), ...(lang && { lang }) })}`,
  ),
);

async function asked({ params, searchParams }: Props) {
  const [{ token, path = [] }, sp] = await Promise.all([params, searchParams]);
  const page = path[0] ?? null;
  return { token, page, body: await first(token, page, one(sp.context), one(sp.lang)) };
}

/** Never listed: a preview is for the people reviewing the change. */
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { body } = await asked(props);
  const d = body?.data;
  const title = d ? `Preview: ${d.view.page?.title ?? d.preview.name} - ${d.preview.name}` : "Preview";
  return { title: { absolute: title }, robots: { index: false, follow: false } };
}

/**
 * /preview/{token}/{page}: a brand as a pull request's files say it
 * (POST /api/v1/brands/{slug}/previews), for anyone with the link.
 */
export default async function PreviewPage(props: Props) {
  const { token, page, body } = await asked(props);
  const d = body?.data;
  if (!d) notFound();
  if (d.view.redirect && d.view.page && page !== d.view.page.slug) redirect(`/preview/${token}/${d.view.page.slug}`);
  return <PreviewView token={token} preview={d.preview} view={d.view} />;
}
