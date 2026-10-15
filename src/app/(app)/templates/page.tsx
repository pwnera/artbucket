import type { Metadata } from "next";
import type { BrandHub } from "@/components/brands";
import { Templates, type OwnTemplate } from "@/components/templates";
import { brandHead } from "@/lib/brand-head";
import { env } from "@/lib/env";
import { brands, get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Templates" };

/**
 * A brand's templates (`?brand=`, else the default one): its latest release
 * (lib/brand-head.ts), its own Office templates (GET /api/v1/brand/office/templates)
 * and its BrandHub listing (GET /api/v1/brands/{slug}/hub), from /api/v1 like
 * any client's.
 */
export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const [{ brand: asked }, list] = await Promise.all([searchParams, brands(), whoami()]);
  const brand = list.find((b) => b.slug === asked) ?? list.find((b) => b.default) ?? list[0] ?? null;
  const [head, hub, own] = brand
    ? await Promise.all([
        brandHead(brand.slug),
        get(`brands/${encodeURIComponent(brand.slug)}/hub`, (x: { data: BrandHub }) => x.data, null),
        get(`brand/office/templates?${new URLSearchParams({ brand: brand.slug })}`, (x: { data: OwnTemplate[] }) => x.data, []),
      ])
    : [null, null, []];
  return (
    <Templates
      brands={list.map(({ slug, name }) => ({ slug, name }))}
      brand={brand && { slug: brand.slug, name: brand.name }}
      release={head?.release ?? null}
      hub={hub}
      own={own}
      origin={env.APP_URL}
    />
  );
}
