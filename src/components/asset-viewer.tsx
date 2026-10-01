"use client";

import { useEffect, useRef, useState } from "react";
import { AssetEditor, AssetEditorSkeleton, type EditorControl } from "@/components/asset-editor";
import { useCan } from "@/components/can";
import type { Asset } from "@/components/gallery";
import { moveTo, suggestions } from "@/components/review-actions";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { hasPreview } from "@/lib/preview";
import { undoable } from "@/lib/undo";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = Omit<
  React.ComponentProps<typeof AssetEditor>,
  "asset" | "onDecided" | "onStep" | "hasPrev" | "hasNext" | "dragging" | "control" | "onDirty"
> & {
  /** The asset open, or null for none. */
  asset: Asset | null;
  /** The URL names an asset that is still being fetched. */
  loading: boolean;
  /** The library's loaded assets, in order: what next and previous step through. */
  assets: Asset[];
  hasMore: boolean;
  onLoadMore: () => Promise<void>;
  /** Show another asset from `assets` in place of this one. */
  onStep: (id: string) => void;
};

/** Keys typed here belong to the control, not the viewer. */
const OWN_KEYS =
  "input,textarea,select,video,audio,iframe,[contenteditable],[role=combobox],[role=slider],[role=tab],[role=radio],[role=menuitem]";

/** A drag of files from the desktop, as opposed to something dragged within the page. */
const carriesFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

/**
 * The library's asset view: the dialog stays mounted across opening,
 * closing and stepping, so it animates out, and a step swaps what is inside
 * under a still overlay. ←/→ and J/K step through `assets` (loading more at
 * the end); a file dropped on it is the asset's next version, never a new
 * asset in the library.
 */
export function AssetViewer(props: Props) {
  const { asset, loading, assets } = props;
  const can = useCan();
  // The last asset shown, still drawn while the dialog animates closed.
  const [last, setLast] = useState(asset);
  if (asset && asset !== last) setLast(asset);
  const shown = asset ?? (loading ? null : last);
  const open = !!asset || loading;

  const editor = useRef<EditorControl>(null);
  const content = useRef<HTMLDivElement>(null);
  // Dirty is per asset: a step or a discard starts the next one clean.
  const [dirtyFor, setDirtyFor] = useState<string | null>(null);
  const dirty = !!shown && dirtyFor === shown.id;
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const afterLoad = useRef<string | null>(null);
  // Which way the last step went: the next asset slides in from that side.
  const [dir, setDir] = useState<1 | -1 | 0>(0);

  const i = shown ? assets.findIndex((a) => a.id === shown.id) : -1;
  const prev = i > 0 ? assets[i - 1] : null;
  const next = i >= 0 ? (assets[i + 1] ?? null) : null;

  /** What is typed saves first; a refused save keeps the asset open to fix it. */
  const leave = async (go: () => void) => {
    if (await (editor.current?.flush() ?? true)) go();
  };

  // The neighbours' previews, fetched ahead, so a step shows its image at once.
  useEffect(() => {
    for (const n of [prev, next]) if (n && hasPreview(n)) new Image().src = `/a/${n.id}/w_640,f_webp`;
  }, [prev, next]);

  // A step past the last loaded asset waits for the next page, then lands;
  // anything else shown since (a step back, a version) calls it off.
  useEffect(() => {
    afterLoad.current = null;
  }, [shown?.id]);
  useEffect(() => {
    const from = afterLoad.current;
    if (!from) return;
    const j = assets.findIndex((a) => a.id === from);
    if (j >= 0 && assets[j + 1]) {
      afterLoad.current = null;
      void leave(() => props.onStep(assets[j + 1].id));
    }
  }, [assets]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = (d: 1 | -1) => {
    afterLoad.current = null;
    setDir(d);
    if (!shown || i < 0) return;
    const to = assets[i + d];
    if (to) return void leave(() => props.onStep(to.id));
    if (d === 1 && props.hasMore)
      void leave(() => {
        afterLoad.current = shown.id;
        void props.onLoadMore();
      });
  };

  /**
   * Approved or rejected: on to the next asset still waiting for review,
   * or out when none is, with Undo putting the decision back.
   */
  const decided = (before: Asset, after: Asset, message: string) => {
    const at = assets.findIndex((a) => a.id === before.id);
    const waiting = (a: Asset) => a.id !== before.id && (a.status === "proposed" || !!suggestions(a));
    const to = at < 0 ? undefined : [...assets.slice(at + 1), ...assets.slice(0, at)].find(waiting);
    props.onReviewed(after);
    if (at >= 0) {
      if (to) props.onStep(to.id);
      else props.onClose();
    }
    // Suggestions taken on an approved asset: moving its status back would undo nothing.
    if (before.status === after.status) return void toast.success(message);
    undoable(message, {
      undo: async () => {
        const r = await moveTo(before, before.status);
        if (!r.ok) throw new Error();
        props.onReviewed((await r.json()).data);
        props.onStep(before.id);
      },
    });
  };

  const versionable = !!shown && can("asset.version", shown);

  return (
    // Every file drag inside the dialog, its dim overlay included, stops here:
    // the library behind would take a drop as a new asset.
    <div
      className="contents"
      onDragEnter={(e) => open && carriesFiles(e) && e.stopPropagation()}
      onDragOver={(e) => {
        if (!open || !carriesFiles(e)) return;
        e.stopPropagation();
        e.preventDefault();
        e.dataTransfer.dropEffect = "none";
      }}
      onDragLeave={(e) => open && carriesFiles(e) && e.stopPropagation()}
      onDrop={(e) => {
        if (!open || !carriesFiles(e)) return;
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) return;
          afterLoad.current = null;
          // What is typed saves on the way out; a save that fails keeps it open.
          void leave(props.onClose);
        }}
      >
        <DialogContent
          ref={content}
          guard={{
            dirty,
            onDiscard: () => {
              editor.current?.discard();
              setDirtyFor(null);
              props.onClose();
            },
            onSave: () => void leave(props.onClose),
          }}
          // Focus the dialog itself, not its first control (a font sample, the video): the keys work at once.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            content.current?.focus();
          }}
          onKeyDown={(e) => {
            const t = e.target as Element;
            if (!e.currentTarget.contains(t)) return;
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
              e.preventDefault();
              void editor.current?.flush();
              return;
            }
            if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || t.closest(OWN_KEYS)) return;
            // Shift only for Shift+C (copy link); the rest are bare keys.
            const key = e.shiftKey ? (e.key === "C" ? "C" : "") : e.key.toLowerCase();
            if (key === "arrowright" || key === "j") step(1);
            else if (key === "arrowleft" || key === "k") step(-1);
            // A held key steps on, but approves, shares or downloads once.
            else if (e.repeat) return void (key && e.preventDefault());
            else if (!key || !editor.current?.shortcut(key)) return;
            e.preventDefault();
          }}
          onDragEnter={(e) => {
            if (!carriesFiles(e)) return;
            e.stopPropagation();
            depth.current++;
            if (versionable) setDragging(true);
          }}
          onDragOver={(e) => {
            if (!carriesFiles(e)) return;
            e.stopPropagation();
            e.preventDefault();
            e.dataTransfer.dropEffect = versionable ? "copy" : "none";
          }}
          onDragLeave={(e) => {
            if (!carriesFiles(e)) return;
            e.stopPropagation();
            if (--depth.current <= 0) {
              depth.current = 0;
              setDragging(false);
            }
          }}
          onDrop={(e) => {
            if (!carriesFiles(e)) return;
            e.stopPropagation();
            e.preventDefault();
            depth.current = 0;
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f && versionable) editor.current?.drop(f);
          }}
          className={cn(
            "gap-0 p-0 max-md:content-start sm:max-w-5xl md:h-[min(760px,calc(100dvh-2rem))] md:grid-cols-[minmax(0,1fr)_380px] md:grid-rows-1 md:overflow-hidden max-md:inset-0 max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0 max-md:data-[state=closed]:zoom-out-100 max-md:data-[state=closed]:slide-out-to-bottom-4 max-md:data-[state=open]:zoom-in-100 max-md:data-[state=open]:slide-in-from-bottom-4",
            // On a phone the whole sheet scrolls and the corner X would go with it: the sticky header has its own.
            shown && "max-md:[&>[data-slot=dialog-close]]:hidden",
          )}
        >
          {shown ? (
            <AssetEditor
              // Per asset: a step crossfades the preview and the panel, under the same overlay.
              key={shown.id}
              asset={shown}
              fields={props.fields}
              collections={props.collections}
              onClose={props.onClose}
              onSaved={props.onSaved}
              onReviewed={props.onReviewed}
              onOpen={props.onOpen}
              onDecided={decided}
              onStep={step}
              from={dir}
              hasPrev={!!prev}
              hasNext={!!next || (i >= 0 && props.hasMore)}
              dragging={dragging}
              control={editor}
              onDirty={(d) => setDirtyFor(d ? shown.id : null)}
            />
          ) : (
            <AssetEditorSkeleton />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
