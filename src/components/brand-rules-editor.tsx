"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { UseInCode } from "@/components/brand-rules";
import type { BrandInfo } from "@/components/brand-switcher";
import { RulesSheet } from "@/components/builder/rules-sheet";
import { useBuilder } from "@/components/builder/use-builder";
import { guidelinesPath } from "@/lib/site";

type Init = Parameters<typeof useBuilder>[1];

/**
 * A brand's Rules tab for whoever may edit (PRD part 2, SITE-10): the
 * builder's own rules list, in the page, on the builder's state, so a rule
 * is changed here as it is there (presets, specs, files, context versions,
 * undo on delete), saved as it is typed into the brand's draft. A page that
 * shows a rule opens in the guidelines. A link to one rule (`#rule-{key}`,
 * lib/site.ts rulesPath) opens it, scrolled to.
 */
export function BrandRulesEditor({ brand, init }: { brand: BrandInfo; init: Init }) {
  const b = useBuilder(brand.slug, init);
  const router = useRouter();
  const { select } = b;
  useEffect(() => {
    const land = () => {
      if (!location.hash.startsWith("#rule-")) return;
      let key = location.hash.slice("#rule-".length);
      try {
        key = decodeURIComponent(key);
      } catch {
        // A stray % in a pasted link: read it as written.
      }
      select({ rule: key });
    };
    land();
    window.addEventListener("hashchange", land);
    return () => window.removeEventListener("hashchange", land);
  }, [select]);
  return (
    <div className="grid gap-4">
      <UseInCode brand={brand} />
      <RulesSheet b={b} onOpenPage={(page) => router.push(guidelinesPath(brand.slug, { page }))} />
    </div>
  );
}
