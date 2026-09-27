import type { Metadata } from "next";
import { BrandEditor } from "@/components/brand-editor";
import { env } from "@/lib/env";
import type { Rule } from "@/lib/rules";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Brand guidelines - Artbucket" };

/**
 * The guidelines, drawn from /api/v1/brand/rules, fetched over HTTP like any
 * other client. Nothing here is authored as a document: the page is the rules,
 * edited in place.
 */
export default async function BrandPage({ searchParams }: { searchParams: Promise<{ context?: string }> }) {
  const { context } = await searchParams;
  const qs = context ? `?context=${encodeURIComponent(context)}` : "";
  const res = await fetch(`${env.APP_URL}/api/v1/brand/rules${qs}`, { cache: "no-store" });
  const { data, contexts }: { data: Rule[]; contexts: string[] } = res.ok ? await res.json() : { data: [], contexts: [] };
  // Remount per context: each view starts from what the server resolved.
  return <BrandEditor key={context ?? ""} initial={data} contexts={contexts} context={context} />;
}
