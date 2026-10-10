"use client";

import { useRouter } from "next/navigation";
import { ThemeEditor } from "@/components/theme-panel";
import type { PageView } from "@/lib/site";

/** A brand's Theme tab: how its managed sites and the kit draw it, edited here rather than in the builder (PRD part 2). */
export function BrandThemeTab({ slug, theme }: { slug: string; theme: PageView["theme"] }) {
  const router = useRouter();
  return (
    <div className="bg-card max-w-2xl rounded-xl border p-4">
      <ThemeEditor slug={slug} theme={theme} active onSaved={() => router.refresh()} />
    </div>
  );
}
