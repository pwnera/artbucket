"use client";

import Link from "next/link";
import { IconFile, IconTypography } from "@/components/icons";
import { Thumb } from "@/components/thumb";
import { isFontAsset as isFont } from "@/lib/font";
import { ruleName, type Rule } from "@/lib/rules";

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
 * show, each opening in the library and saying where it is used, by the
 * rule's name. Pictures first, as tiles; typeface files after, as a list,
 * since a family is many files that look alike; anything else last.
 */
export function BrandAssets({ assets, rules }: { assets: BrandAsset[] | null; rules: Pick<Rule, "key" | "label">[] }) {
  if (!assets) return <p className="text-muted-foreground text-sm">The brand&apos;s files couldn&apos;t load. Try again in a moment.</p>;
  if (!assets.length) return <p className="text-muted-foreground text-sm">No files yet: logos and images show here once a rule or a page uses them.</p>;
  const names = new Map(rules.map((r) => [r.key, ruleName(r)]));
  const used = (a: BrandAsset) => [...new Set(a.rules.map((k) => names.get(k) ?? k))].concat(a.pages.map((p) => `the ${p.title} page`)).join(", ");
  const fonts = assets.filter((a) => !a.preview && isFont(a));
  const pictures = assets.filter((a) => a.preview);
  const other = assets.filter((a) => !a.preview && !isFont(a));
  return (
    <div className="grid gap-8">
      {pictures.length > 0 && (
        <Group title="Logos and images" n={pictures.length}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {pictures.map((a) => (
              <li key={a.id}>
                <Link href={`/?asset=${a.id}`} className="bg-card hover:border-foreground/30 grid overflow-hidden rounded-xl border">
                  <span className="bg-checker relative grid aspect-square place-items-center border-b">
                    <Thumb src={`/a/${a.id}/w_320,f_webp`} alt={a.title} className="absolute inset-0 object-contain p-3" />
                  </span>
                  <span className="grid gap-0.5 p-3">
                    <span className="truncate text-sm font-medium">{a.title}</span>
                    <span className="text-muted-foreground line-clamp-2 text-xs">{used(a)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Group>
      )}
      {[
        { title: "Typeface files", files: fonts, icon: IconTypography },
        { title: "Other files", files: other, icon: IconFile },
      ].map(
        ({ title, files, icon: Icon }) =>
          files.length > 0 && (
            <Group key={title} title={title} n={files.length}>
              <ul className="bg-card divide-y rounded-xl border">
                {files.map((a) => (
                  <li key={a.id}>
                    <Link href={`/?asset=${a.id}`} className="hover:bg-muted/50 flex items-center gap-3 px-4 py-2.5">
                      <Icon aria-hidden className="text-muted-foreground size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.filename}</span>
                      <span className="text-muted-foreground hidden max-w-[50%] truncate text-xs sm:block">{used(a)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Group>
          ),
      )}
    </div>
  );
}

function Group({ title, n, children }: { title: string; n: number; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {title} <span className="text-muted-foreground text-xs font-normal tabular-nums">{n}</span>
      </h2>
      {children}
    </section>
  );
}
