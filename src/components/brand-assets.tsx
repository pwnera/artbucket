"use client";

import Link from "next/link";
import { IconFile } from "@tabler/icons-react";
import { Thumb } from "@/components/thumb";

/** GET /api/v1/brands/{slug}/assets, as lib/schemas.ts BrandAsset has it. */
export type BrandAsset = {
  id: string;
  title: string;
  filename: string;
  mime: string;
  width: number | null;
  height: number | null;
  preview: boolean;
  rules: string[];
  pages: { slug: string; title: string }[];
};

/**
 * A brand's Assets tab, read-only: the files its rules hold and its pages
 * show, each with where it is used, opening in the library.
 */
export function BrandAssets({ assets }: { assets: BrandAsset[] | null }) {
  if (!assets) return <p className="text-muted-foreground text-sm">The brand&apos;s files couldn&apos;t load. Try again in a moment.</p>;
  if (!assets.length) return <p className="text-muted-foreground text-sm">No files yet: a rule&apos;s logo or a page&apos;s image shows here once the brand uses it.</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {assets.map((a) => (
        <li key={a.id}>
          <Link href={`/?asset=${a.id}`} className="bg-card hover:border-foreground/30 grid overflow-hidden rounded-xl border">
            <span className="bg-checker relative grid aspect-square place-items-center border-b">
              {a.preview ? (
                <Thumb src={`/a/${a.id}/w_320,f_webp`} alt={a.title} className="object-contain p-3" />
              ) : (
                <span className="text-muted-foreground grid justify-items-center gap-1 text-xs">
                  <IconFile aria-hidden className="size-8" stroke={1.5} />
                  {a.filename.split(".").pop()?.toUpperCase()}
                </span>
              )}
            </span>
            <span className="grid gap-0.5 p-3">
              <span className="truncate text-sm font-medium">{a.title}</span>
              <span className="text-muted-foreground line-clamp-2 text-xs">
                {[...a.rules.map((k) => k), ...a.pages.map((p) => `page ${p.title}`)].join(" · ")}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
