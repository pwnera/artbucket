import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BrandRules } from "@/components/brand-rules";
import { TabSkeleton } from "@/components/skeletons";
import { brandHead } from "@/lib/brand-head";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head ? `${head.brand.name} tokens and rules` : "Tokens and rules" };
}

/** A brand's Tokens and rules tab: its rules read-only, and its tokens to download (GET /api/v1/brand/rules, /brand/tokens). */
export default function BrandRulesPage({ params }: Props) {
  return (
    <Suspense fallback={<TabSkeleton />}>
      <Tab params={params} />
    </Suspense>
  );
}

async function Tab({ params }: Props) {
  const { slug } = await params;
  const head = await brandHead(slug);
  if (!head) notFound();
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 md:px-6">
      <BrandRules brand={head.brand} rules={head.rules} />
    </div>
  );
}
