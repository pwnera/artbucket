import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GovernanceTab } from "@/components/catalog";
import { brandHead } from "@/lib/brand-head";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const head = await brandHead((await params).slug);
  return { title: head ? `${head.brand.name} · Activity` : "Activity" };
}

/** A brand's Activity tab: the catalog's, as every object has it (components/catalog.tsx). */
export default async function ActivityTab({ params }: Props) {
  const head = await brandHead((await params).slug);
  if (!head) notFound();
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 md:px-6">
      <GovernanceTab id={head.brand.id} tab="activity" />
    </div>
  );
}
