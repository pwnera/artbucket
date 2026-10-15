"use client";

import { CommentsPanel, useComments } from "@/components/builder/comments";
import { goTo } from "@/components/site/anchors";
import { IconMessageCircle } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { PageView } from "@/lib/site";
import { sendResult } from "@/lib/send";
import type { Target } from "@/lib/permissions";

const transport = (method: string, url: string, body?: unknown) => sendResult(method, url, body, { quiet: true });

/**
 * Review comments in the guidelines reader, open while the address says
 * `?comments=1`: the threads of the page being read, a click on one's
 * section scrolling to it, then the other pages with open threads, one
 * click from theirs. Where comments are read and answered now that pages
 * are no longer edited in a builder; agents read and write them over MCP.
 */
export function ReaderComments({
  view,
  brand,
  open,
  onOpenChange,
  onPage,
}: {
  view: PageView;
  /** The brand, by id and whether it is private: who may comment is decided on it. */
  brand: Target;
  open: boolean;
  onOpenChange(open: boolean): void;
  onPage(slug: string): void;
}) {
  const comments = useComments(view.brand.slug, brand, transport);
  const page = view.page;
  const title = (slug: string) => view.nav.find((p) => p.slug === slug)?.title ?? slug;
  const elsewhere = [...comments.byPage].filter(([slug, n]) => n > 0 && slug !== page?.slug);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <IconMessageCircle aria-hidden className="size-4" /> Comments
          </SheetTitle>
          <SheetDescription>{page ? `On ${page.title}` : "On this brand's pages"}</SheetDescription>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto p-4">
          {page && (
            <CommentsPanel
              comments={comments}
              page={page.slug}
              section={null}
              onPickSection={(id) => goTo(id)}
              sectionName={(id) => page.sections.find((s) => s.id === id)?.title || undefined}
            />
          )}
          {elsewhere.length > 0 && (
            <section aria-labelledby="comments-elsewhere" className="grid gap-2">
              <h3 id="comments-elsewhere" className="text-muted-foreground text-xs font-medium">
                Open on other pages
              </h3>
              <ul className="grid gap-1">
                {elsewhere.map(([slug, n]) => (
                  <li key={slug}>
                    <button type="button" onClick={() => onPage(slug)} className="hover:bg-muted flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-sm">
                      <span className="truncate">{title(slug)}</span>
                      <Badge variant="secondary">{n}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
