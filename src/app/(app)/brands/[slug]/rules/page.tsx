import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandHeader } from "@/components/brand-header";
import { BrandRules } from "@/components/brand-rules";
import { AppHeader } from "@/components/page";
import { brandHead } from "@/lib/brand-head";
import { env } from "@/lib/env";
import { brandPath } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head ? `${head.brand.name} tokens and rules` : "Tokens and rules" };
}

/** A brand's Tokens and rules tab: its rules read-only, and its tokens to download (GET /api/v1/brand/rules, /brand/tokens). */
export default async function BrandRulesPage({ params }: Props) {
  const { slug } = await params;
  const head = await brandHead(slug);
  if (!head) notFound();
  const { brand, rules, status, release } = head;
  return (
    <>
      <AppHeader trail={[{ label: "Brands", href: "/brands" }, { label: brand.name, href: brandPath(slug) }, { label: "Tokens and rules" }]} />
      <BrandHeader brand={brand} origin={env.APP_URL} rules={rules} hub={status?.hub ?? null} release={release} at="rules" />
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 md:px-6">
        <BrandRules brand={brand} rules={rules} />
      </div>
    </>
  );
}
