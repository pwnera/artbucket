"use client";

import { useCallback } from "react";
import { IconGitPullRequest } from "@/components/icons";
import { SiteView } from "@/components/site/site-view";
import type { PageView } from "@/lib/site";

export type PreviewMeta = {
  brand: string;
  name: string;
  ref: string;
  title: string | null;
  commit: string | null;
  updatedAt: string;
  expiresAt: string;
};
export type PreviewBody = { data?: { preview: PreviewMeta; view: PageView }; error?: { code: string; message: string } };

/**
 * A preview's link (app/preview): the brand's site as a proposed change's
 * files say it (core/brand-sync.ts savePreview), under a bar that says so.
 * Every link stays inside the preview; nothing here is the brand's draft.
 */
export function PreviewView({ token, preview, view }: { token: string; preview: PreviewMeta; view: PageView }) {
  const href = useCallback((page: string, section?: string) => `/preview/${token}/${page}${section ? `#${section}` : ""}`, [token]);
  return (
    <>
      <div role="note" className="bg-muted text-foreground sticky top-0 z-50 flex h-14 items-center gap-2 border-b px-4 text-sm">
        <IconGitPullRequest className="size-4 shrink-0" aria-hidden />
        <span className="font-medium">Preview</span>
        <span className="text-muted-foreground truncate">
          {preview.title ? `${preview.title} (${preview.ref})` : preview.ref}
          {preview.commit ? ` at ${preview.commit.slice(0, 7)}` : ""}. Not released: this is {preview.name} as the change would make it.
        </span>
      </div>
      <main>
        <SiteView view={view} href={href} top="top-14" />
      </main>
    </>
  );
}
