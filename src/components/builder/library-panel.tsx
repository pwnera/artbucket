"use client";

import { useEffect, useState } from "react";
import { IconPhoto, IconSearch } from "@tabler/icons-react";
import { asMedia } from "@/components/brand-sections/slots";
import { startDrag, endDrag } from "@/components/builder/drag";
import { FloatingPanel } from "@/components/builder/floating-panel";
import type { BuilderApi } from "@/components/builder/use-builder";
import type { Asset } from "@/components/gallery";
import { useSite } from "@/components/site/site-context";
import { Thumb } from "@/components/thumb";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { hasPreview } from "@/lib/preview";
import type { Media } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The library beside the page, as a design tool's assets panel: a
 * FloatingPanel to search, narrowed to pictures or videos, whose assets drag
 * onto the canvas (drag.ts `assets`: into a section of pictures, as a
 * section's picture, or between sections as a gallery) or, clicked, land on
 * the picked section (`onPlace`). Only what has a preview shows: a page
 * shows pictures.
 *
 * Props:
 * - b: the builder, whose transport asks the library.
 * - onPlace: an asset clicked, as the page's media.
 * - onClose: its X, or Esc.
 */
export function LibraryPanel({ b, onPlace, onClose }: { b: BuilderApi; onPlace(media: Media[]): void; onClose(): void }) {
  const { url } = useSite();
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | "image" | "video">("all");
  const [found, setFound] = useState<{ for: string; assets: Asset[] | null }>({ for: "", assets: null });
  const [failed, setFailed] = useState<string | null>(null);
  const asked = `${type}\n${q.trim()}`;

  // One search per pause in typing; an older answer never shows as a newer one's.
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ limit: "60", ...(q.trim() && { q: q.trim() }), ...(type !== "all" && { type }) });
      const r = await b.transport("GET", `/api/v1/assets?${params}`);
      if (!live) return;
      if (!r.ok) return setFailed((!r.network && r.error?.message) || "Couldn't reach the library");
      setFailed(null);
      setFound({ for: asked, assets: (r.data as Asset[] | null) ?? [] });
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [asked, q, type, b]);

  const shown = found.for === asked ? found.assets?.filter(hasPreview) : null;
  const media = (a: Asset) => [asMedia(a, url)];

  return (
    <FloatingPanel id="library" title="Library" icon={<IconPhoto />} width={320} onClose={onClose}>
      <div className="grid gap-2 p-3">
        <div className="relative">
          <IconSearch aria-hidden className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library" aria-label="Search the library" className="h-8 ps-8" />
        </div>
        <ToggleGroup type="single" size="sm" variant="outline" value={type} onValueChange={(v) => v && setType(v as typeof type)} aria-label="Kind">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="image">Pictures</ToggleGroupItem>
          <ToggleGroupItem value="video">Videos</ToggleGroupItem>
        </ToggleGroup>
        <p className="text-muted-foreground text-xs">Drag onto the page, or click to put it on the picked section.</p>
        {failed ? (
          <p role="alert" className="text-destructive text-sm">
            {failed}
          </p>
        ) : shown?.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{q.trim() ? <>Nothing matches &ldquo;{q.trim()}&rdquo;.</> : "Nothing to show yet."}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-1.5" aria-busy={!shown} aria-label="Assets">
            {shown
              ? shown.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      draggable
                      title={a.metadata?.title ?? a.filename}
                      aria-label={a.metadata?.title ?? a.filename}
                      onDragStart={(e) => {
                        startDrag(e, { kind: "assets", media: media(a) }, "copy");
                        const img = e.currentTarget.querySelector("img");
                        if (img) e.dataTransfer.setDragImage(img, 24, 24);
                      }}
                      onDragEnd={endDrag}
                      onClick={() => onPlace(media(a))}
                      className={cn(
                        "bg-muted hover:ring-primary focus-visible:ring-ring relative block aspect-square w-full cursor-grab overflow-hidden rounded-md border outline-none hover:ring-2 focus-visible:ring-2 active:cursor-grabbing",
                      )}
                    >
                      <Thumb src={url(a.id, "/w_240,f_webp")} alt="" />
                    </button>
                  </li>
                ))
              : Array.from({ length: 9 }, (_, i) => (
                  <li key={i}>
                    <Skeleton className="aspect-square rounded-md" />
                  </li>
                ))}
          </ul>
        )}
      </div>
    </FloatingPanel>
  );
}
