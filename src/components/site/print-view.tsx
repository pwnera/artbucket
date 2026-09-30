"use client";

import { useCallback } from "react";
import { SiteView } from "@/components/site/site-view";
import { guidelinesPath, type PageView } from "@/lib/site";

/**
 * A page for the server's own browser (app/print, core/print.ts): the site
 * alone, no app header, no theme panel, every link the reader's address so
 * nothing here fetches. What the picture an agent asks for is taken of.
 */
export function PrintView({ view }: { view: PageView }) {
  const href = useCallback((page: string, section?: string) => `${guidelinesPath(view.brand.slug, { page })}${section ? `#${section}` : ""}`, [view.brand.slug]);
  return (
    <main>
      <SiteView view={view} href={href} />
    </main>
  );
}
