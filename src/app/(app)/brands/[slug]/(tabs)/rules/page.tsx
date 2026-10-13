import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BrandRules } from "@/components/brand-rules";
import { BrandRulesEditor } from "@/components/brand-rules-editor";
import { TabSkeleton } from "@/components/skeletons";
import { brandHead } from "@/lib/brand-head";
import { builderInit } from "@/lib/builder-init";
import { can } from "@/lib/permissions";
import { whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head ? `${head.brand.name} rules` : "Rules" };
}

/**
 * A brand's Rules tab: its rules, edited here by whoever may edit the brand
 * (on the builder's state, builder-init.ts), else read; and its tokens to
 * download (GET /api/v1/brand/rules, /brand/tokens).
 */
export default function BrandRulesPage({ params }: Props) {
  return (
    <Suspense fallback={<TabSkeleton />}>
      <Tab params={params} />
    </Suspense>
  );
}

async function Tab({ params }: Props) {
  const { slug } = await params;
  const [head, me] = await Promise.all([brandHead(slug), whoami()]);
  if (!head) notFound();
  const editing = can(me, "brand.edit") ? await builderInit(slug) : null;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 md:px-6">
      {editing?.init ? <BrandRulesEditor brand={head.brand} init={editing.init} /> : <BrandRules brand={head.brand} rules={head.rules} />}
    </div>
  );
}
