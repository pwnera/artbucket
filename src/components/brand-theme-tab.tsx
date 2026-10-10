"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconWorldUpload } from "@/components/icons";
import { ThemeEditor } from "@/components/theme-panel";
import { Button } from "@/components/ui/button";
import { brandPath, type PageView } from "@/lib/site";

/**
 * A brand's Theme tab: how its managed sites and the kit draw it, edited here rather than in the builder (PRD part 2).
 * A change is a draft, like the rules' (lib/core/theme.ts): portals wear the last release's, so the tab says so and offers Release.
 */
export function BrandThemeTab({ slug, theme, behind, released }: { slug: string; theme: PageView["theme"]; behind: boolean; released: boolean }) {
  const router = useRouter();
  return (
    <div className="grid max-w-2xl gap-3">
      {(behind || !released) && (
        <div className="bg-muted/50 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 text-sm">
          <p className="min-w-0 flex-1">
            {released ? "Unreleased changes. Portals and BrandHub show the last release's theme until you release." : "Not released yet. Release the brand to put this theme on its portals."}
          </p>
          <Button asChild size="sm">
            <Link href={brandPath(slug, "/releases/new")}>
              <IconWorldUpload aria-hidden /> Release
            </Link>
          </Button>
        </div>
      )}
      <div className="bg-card rounded-xl border p-4">
        <ThemeEditor slug={slug} theme={theme} active onSaved={() => router.refresh()} />
      </div>
    </div>
  );
}
