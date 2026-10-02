import { notFound } from "next/navigation";
import { BrandPageHeader } from "@/components/brand-header";
import type { Source } from "@/components/builder/use-status";
import { brandHead } from "@/lib/brand-head";
import { env } from "@/lib/env";
import { get } from "@/lib/sidebar";

type Props = { children: React.ReactNode; params: Promise<{ slug: string }> };

/**
 * A brand's tabs under one header, which stays while a tab changes: each tab
 * streams its body in under it, behind its own Suspense placeholder.
 * ../loading.tsx is for coming to the brand; the Guidelines tab draws its own
 * header, one line, so it is not here.
 */
export default async function BrandTabsLayout({ children, params }: Props) {
  const { slug } = await params;
  const head = await brandHead(slug);
  if (!head) notFound();
  const { brand, rules, status, release } = head;
  // Brought in from a repository and not in yet (as the Overview tells it).
  const source = !rules.length && !release ? await get(`brands/${encodeURIComponent(slug)}/source`, (x: { data: Source }) => x.data.source, null) : null;
  return (
    <>
      <BrandPageHeader brand={brand} origin={env.APP_URL} rules={rules} status={status} release={release} importing={!!source && !source.syncedAt} />
      {children}
    </>
  );
}
