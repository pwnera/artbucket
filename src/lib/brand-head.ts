import { cache } from "react";
import type { BrandInfo } from "@/components/brand-switcher";
import type { Status } from "@/components/builder/use-status";
import { releaseLines, type ReleaseLine, type SnapRule } from "@/lib/history";
import type { SnapPage } from "@/lib/pages";
import type { Rule } from "@/lib/rules";
import { brands, get } from "@/lib/sidebar";

/**
 * What every tab of a brand's page reads for its header (components/brand-header.tsx):
 * the brand, its rules (the logo), its status (BrandHub, the score) and its
 * history (the latest release), from /api/v1 like any client's, once per
 * request: the title and the page share it. Null: no such brand here.
 */

/** A version as GET .../versions lists it: what the brand's pages read. */
export type VersionRow = { number: number; publishedAt: string | null; note: string | null; rules: number; pages: number | null; updatedAt: string; createdAt: string };
/** A release: a version readers got. */
export type Release = { number: number; publishedAt: string; note: string | null; rules: number; pages: number | null };
/** The brand as GET /api/v1/brands lists it: `from` is the BrandHub brand it started from, `domain` its own. */
export type HeadBrand = BrandInfo & { from?: string | null; domain?: string | null };

export const brandHead = cache(async (slug: string) => {
  const brand = (await brands()).find((b) => b.slug === slug) as HeadBrand | undefined;
  if (!brand) return null;
  const b = encodeURIComponent(slug);
  const [rules, status, versions] = await Promise.all([
    get(`brand/rules?brand=${b}`, (x: { data: Rule[] }) => x.data, []),
    get(`brands/${b}/status`, (x: { data: Status }) => x.data, null),
    get(`brands/${b}/versions`, (x: { data: VersionRow[] }) => x.data, []),
  ]);
  const releases = versions.filter((v): v is VersionRow & Release => !!v.publishedAt);
  return { brand, rules, status, versions, releases, release: (releases[0] as Release | undefined) ?? null };
});

type Snapshot = { rules: SnapRule[]; pages: SnapPage[] | null };
const snapshot = (slug: string, n: number) => get(`brands/${encodeURIComponent(slug)}/versions/${n}`, (x: { data: Snapshot }) => x.data, null);

/** What version `to` changes from version `from` (null: from nothing), line by line (lib/history.ts releaseLines); null when either can't be read. */
export async function changesBetween(slug: string, from: number | null, to: number): Promise<ReleaseLine[] | null> {
  const [was, is] = await Promise.all([from ? snapshot(slug, from) : null, snapshot(slug, to)]);
  return is && (from === null || was) ? releaseLines(was, is) : null;
}
