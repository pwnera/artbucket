"use client";

import { useEffect, useState } from "react";
import { IconChevronDown, IconRefresh, IconSearch, IconX } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import type { Transport } from "@/components/builder/use-builder";
import { FontThumb } from "@/components/font-preview";
import type { Asset } from "@/components/gallery";
import { RenditionMenu } from "@/components/rendition-menu";
import { useAssetUrl } from "@/components/site/asset-url";
import { IconGlyph } from "@/components/icon-glyph";
import { Thumb } from "@/components/thumb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { isFont } from "@/lib/font";
import { hasPreview, isIcon, isMono } from "@/lib/preview";
import { fontValue, ruleName } from "@/lib/rules";
import { sendResult } from "@/lib/send";
import type { ViewAsset, ViewRule } from "@/lib/site";
import { renditionLabel } from "@/lib/transform";
import { cn } from "@/lib/utils";

/**
 * Search the library and pick what a rule points at, in the order picked,
 * each at a rendition (build spec 3.5.4, W6.4; copied from brand-editor.tsx
 * AssetPicker, which W6.I deletes). The rule card and the rules sheet (W6.6)
 * both use it.
 *
 * Props:
 * - open: kept mounted while it closes, so it fades out whole.
 * - rule: whose assets, as they stand.
 * - onClose: Esc, Cancel, or after a save.
 * - onSave: the picked assets, described as a view describes them, so the
 *   canvas draws them at once (the caller sets the rule with them).
 * - title, description: its heading, when it picks for something other
 *   than a rule (a section's items); left out, the rule's.
 * - transport: how it searches; the builder's (b.transport), so the dev page
 *   answers too. Left out, fetch.
 */
export type AssetPickerProps = {
  open: boolean;
  rule: ViewRule;
  onClose(): void;
  onSave(assets: ViewAsset[]): void;
  title?: string;
  description?: string;
  transport?: Transport;
};

const network: Transport = (method, url, body) => sendResult(method, url, body, { quiet: true });

/** A library asset as a view describes it (core/page-view.ts), at its original. */
const described = (a: Asset): ViewAsset => ({
  id: a.id,
  rendition: null,
  title: a.metadata?.title ?? null,
  filename: a.filename,
  mime: a.mime,
  size: a.size,
  width: a.width,
  height: a.height,
  preview: hasPreview(a),
  supersededBy: a.supersededBy,
});

// A font rule's files are named after the family, without its spaces: DMSans-Bold.ttf.
const firstQuery = (rule: ViewRule) => (rule.type === "font" ? fontValue(rule.value).family.replace(/ +/g, "") : "");

export function AssetPicker({ open, rule, onClose, onSave, title, description, transport = network }: AssetPickerProps) {
  const url = useAssetUrl();
  const [q, setQ] = useState(() => firstQuery(rule));
  const [results, setResults] = useState<Asset[] | null>(null);
  // A search on the way: the last results stay, dimmed, until it lands.
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState(rule.assets);
  // Opened again while still mounted: it starts from the rule as it stands now.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPicked(rule.assets);
      setQ(firstQuery(rule));
    }
  }

  useEffect(() => {
    if (!open) return;
    // Only the latest query answers: an older, slower one is dropped, not drawn over it.
    let live = true;
    const t = setTimeout(async () => {
      setSearching(true);
      const res = await transport("GET", `/api/v1/assets?limit=48${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      if (!live) return;
      if (res.ok) setResults(res.data as Asset[]);
      setFailed(!res.ok);
      setSearching(false);
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, q, attempt, transport]);

  // What the rule and the search have shown, described, so a pick is saved as the canvas draws it.
  const [known, setKnown] = useState<Record<string, ViewAsset>>(() => Object.fromEntries(rule.assets.map((a) => [a.id, a])));
  if (results?.some((a) => !(a.id in known))) setKnown((k) => ({ ...Object.fromEntries(results.map((a) => [a.id, described(a)])), ...k }));

  const toggle = (id: string) =>
    setPicked((p) => (p.some((x) => x.id === id) ? p.filter((x) => x.id !== id) : [...p, { ...known[id], rendition: null }]));
  const setRendition = (id: string, rendition: string | null) => setPicked((p) => p.map((x) => (x.id === id ? { ...x, rendition } : x)));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* Outside the canvas, so no container to query: the dialog's own breakpoint is widened. */}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title ?? `${rule.type === "font" ? "Files" : "Assets"} for ${ruleName(rule)}`}</DialogTitle>
          <DialogDescription>
            {description ??
              (rule.type === "font"
              ? "One file per style. Agents get each file's URL."
                : "Pick a size under each: agents get that exact URL.")}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <IconSearch className="text-muted-foreground absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the library"
            aria-label="Search the library"
            className="ps-8 pe-8"
          />
          {searching && results && (
            <Spinner aria-label="Searching" className="text-muted-foreground absolute end-2.5 top-1/2 size-4 -translate-y-1/2" />
          )}
        </div>
        {picked.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Picked, in order">
            {picked.map((a, i) => (
              <div key={a.id} className="grid w-20 shrink-0 gap-1">
                <div className="bg-checker relative size-20 overflow-hidden rounded-md border">
                  <AssetThumb asset={a} />
                  <span className="bg-primary text-primary-foreground absolute start-0.5 bottom-0.5 flex size-4 items-center justify-center rounded-full text-2xs">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    aria-label={`Unpick ${a.title ?? a.filename}`}
                    onClick={() => toggle(a.id)}
                    className="bg-background/90 absolute end-0.5 top-0.5 rounded-full p-0.5 shadow-sm"
                  >
                    <IconX className="size-3" />
                  </button>
                </div>
                {isFont(a.mime, a.filename) ? null : !a.preview ? (
                  <span className="text-muted-foreground truncate text-center text-2xs">Original</span>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="hover:bg-muted flex items-center justify-center gap-0.5 truncate rounded px-1 text-2xs font-medium"
                        title="Which size the rule means"
                        aria-label={`Size of ${a.title ?? a.filename}: ${renditionLabel(a.rendition)}`}
                      >
                        <span className="truncate">{renditionLabel(a.rendition)}</span>
                        <IconChevronDown className="size-3 shrink-0" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80 p-0">
                      <RenditionMenu value={a.rendition} onChange={(r) => setRendition(a.id, r)} />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            ))}
          </div>
        )}
        {/* The scroll box and the grid are separate: square tiles in a height-capped grid squash into each other. */}
        <div className="-mx-1 max-h-[50vh] overflow-y-auto p-1">
          {failed ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-muted-foreground text-sm">Couldn&apos;t load the library.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFailed(false);
                  setAttempt((n) => n + 1);
                }}
              >
                <IconRefresh /> Retry
              </Button>
            </div>
          ) : (
            <div className={cn("grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 transition-opacity", searching && results && "opacity-60")}>
              {!results && Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-md" />)}
              {results?.map((a) => {
                const n = picked.findIndex((x) => x.id === a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={n >= 0}
                    aria-label={a.metadata?.title ?? a.filename}
                    onClick={() => toggle(a.id)}
                    className={cn("group bg-muted relative aspect-square overflow-hidden rounded-md border text-start", n >= 0 && "ring-primary ring-2")}
                  >
                    {isIcon(a) ? (
                      // The vector, at a glyph's size: a 24px icon's rendition would blur.
                      <span className="text-foreground absolute inset-0 flex items-center justify-center">
                        <IconGlyph src={url(a.id)} mono={isMono(a)} label={a.filename} className="size-10" />
                      </span>
                    ) : hasPreview(a) ? (
                      <Thumb src={url(a.id, "/w_160,f_webp")} alt={a.filename} />
                    ) : isFont(a.mime, a.filename) ? (
                      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2">
                        <FontThumb id={a.id} className="text-3xl" />
                        <span className="text-muted-foreground w-full truncate text-center text-2xs">{a.filename}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground absolute inset-0 flex items-center justify-center p-2 text-center text-xs break-all">
                        {a.filename}
                      </span>
                    )}
                    {n >= 0 && (
                      <span className="bg-primary text-primary-foreground absolute start-1 top-1 flex size-5 items-center justify-center rounded-full text-xs">
                        {n + 1}
                      </span>
                    )}
                  </button>
                );
              })}
              {results?.length === 0 && <p className="text-muted-foreground col-span-full py-8 text-center text-sm">Nothing found.</p>}
            </div>
          )}
        </div>
        <DialogFooter className="items-center">
          <span className="text-muted-foreground me-auto text-sm">{picked.length} picked</span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(picked);
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One of a rule's assets in a square tile (the parent's `relative` box): its face, its picture, or its name. */
export function AssetThumb({ asset: a }: { asset: ViewAsset }) {
  const url = useAssetUrl();
  if (isFont(a.mime, a.filename))
    return (
      <span className="absolute inset-0 flex items-center justify-center">
        <FontThumb id={a.id} className="text-2xl" />
      </span>
    );
  if (a.preview) return <Thumb src={url(a.id, "/w_80,f_webp")} alt={a.title ?? a.filename} className="p-1" />;
  return <span className="text-muted-foreground absolute inset-0 flex items-center justify-center p-1 text-center text-2xs break-all">{a.filename}</span>;
}
