"use client";

import { useRouter } from "next/navigation";
import { ThemeEditor } from "@/components/theme-panel";
import type { PageView } from "@/lib/site";

/**
 * A brand's Look tab: its accent, colors, faces and logo, edited on the rules
 * behind them, and how its sites and the kit draw it (PRD part 2). A change is
 * a draft, like the rules' (lib/core/theme.ts): the header says so and offers
 * Release, so the tab doesn't.
 */
export function BrandThemeTab({ slug, theme }: { slug: string; theme: PageView["theme"] }) {
  const router = useRouter();
  return (
    <div className="bg-card rounded-xl border p-4">
      <ThemeEditor slug={slug} theme={theme} active onSaved={() => router.refresh()} />
    </div>
  );
}
