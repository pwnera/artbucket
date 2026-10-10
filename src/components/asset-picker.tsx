"use client";

import { useEffect, useState } from "react";
import { IconSearch } from "@/components/icons";
import type { Asset } from "@/components/gallery";
import { IconGlyph } from "@/components/icon-glyph";
import { Thumb } from "@/components/thumb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPreview, isIcon, isMono } from "@/lib/preview";

/**
 * Pick one asset from the library: an image, unless `filter` says what
 * qualifies instead. It says when it is loading and when the library
 * couldn't be reached, rather than looking empty.
 */
export function LibraryPicker({
  onClose,
  onPick,
  filter,
  title = "Add an image",
  description = "Inserted where the cursor was.",
}: {
  onClose: () => void;
  onPick: (a: Asset) => void;
  /** Which assets are offered; images when absent. */
  filter?: (a: Asset) => boolean;
  title?: string;
  description?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Asset[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    // One request per query: a slow earlier answer can't overwrite a newer one.
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/assets?limit=48${q ? `&q=${encodeURIComponent(q)}` : ""}`, { signal: ctl.signal });
        if (!res.ok) throw new Error(String(res.status));
        setResults((await res.json()).data);
        setFailed(false);
      } catch {
        if (!ctl.signal.aborted) setFailed(true);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, attempt]);

  const shown = results?.filter(filter ?? hasPreview);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library" />
        <div className="-mx-1 max-h-[50vh] overflow-y-auto p-1">
          {failed ? (
            <Empty size="sm">
              <EmptyHeader>
                <EmptyTitle>Couldn&apos;t load the library</EmptyTitle>
                <EmptyDescription>Check the connection and try again.</EmptyDescription>
              </EmptyHeader>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFailed(false);
                  setResults(null);
                  setAttempt((n) => n + 1);
                }}
              >
                Retry
              </Button>
            </Empty>
          ) : shown?.length === 0 ? (
            <Empty size="sm">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconSearch />
                </EmptyMedia>
                <EmptyTitle>{filter ? "Nothing found" : "No images found"}</EmptyTitle>
                {q && <EmptyDescription>Nothing matches &ldquo;{q}&rdquo;. Try fewer words.</EmptyDescription>}
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-busy={!shown}>
              {shown
                ? shown.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onPick(a)}
                      className="bg-muted hover:ring-primary relative aspect-square overflow-hidden rounded-md border hover:ring-2"
                    >
                      {isIcon(a) ? (
                        // The vector, at a glyph's size: a 24px icon's rendition would blur.
                        <span className="text-foreground absolute inset-0 flex items-center justify-center">
                          <IconGlyph src={`/a/${a.id}`} mono={isMono(a)} label={a.filename} className="size-10" />
                        </span>
                      ) : hasPreview(a) ? (
                        <Thumb src={`/a/${a.id}/w_160,f_webp`} alt={a.filename} />
                      ) : (
                        <span className="text-muted-foreground absolute inset-0 flex items-center justify-center p-2 text-center text-xs break-all">
                          {a.filename}
                        </span>
                      )}
                    </button>
                  ))
                : Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-md" />)}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
