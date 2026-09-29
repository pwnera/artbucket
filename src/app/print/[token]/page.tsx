import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintView } from "@/components/site/print-view";
import { draftSource, viewPage } from "@/lib/core/page-view";
import { pageSig } from "@/lib/core/signing";
import { env } from "@/lib/env";
import { DEFAULT_PRESETS } from "@/lib/portal";
import { readPrintToken } from "@/lib/print-token";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * A brand page drawn for the server's own headless browser (core/print.ts):
 * the draft as members read it, its asset URLs signed for the minutes the
 * token lasts, with no session. The token says which page, and for whom.
 */
export default async function PrintPage({ params }: { params: Promise<{ token: string }> }) {
  const claim = readPrintToken(env.BETTER_AUTH_SECRET, (await params).token);
  if (!claim) notFound();
  const view = await viewPage(claim.ws, await draftSource(claim.ws, claim.brand), claim.page, {
    context: claim.context,
    lang: claim.lang,
    level: "members",
    sign: (id) => pageSig(id),
    presets: DEFAULT_PRESETS,
  }).catch(() => null);
  if (!view) notFound();
  return <PrintView view={view} />;
}
