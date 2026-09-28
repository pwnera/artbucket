"use client";

import {
  IconArchive,
  IconArrowBackUp,
  IconCheck,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconLink,
  IconLinkOff,
  IconSelect,
  IconShare,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { useCan } from "@/components/can";
import type { Asset } from "@/components/gallery";
import { extOf, PRESETS, stem } from "@/components/renditions";
import { approve, moveTo, suggestions } from "@/components/review-actions";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { hasPreview } from "@/lib/preview";

/** Save a URL the way a download link would, without one on the page. */
function save(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

async function copy(href: string, what: string) {
  try {
    await navigator.clipboard.writeText(href);
    toast.success(`Copied ${what}`);
  } catch {
    toast.error("Couldn't copy the link", { description: href });
  }
}

/**
 * Right click on an asset: what its card, its row and its editor offer, in
 * one place. It acts on that asset; the selection has its own bar. Each item
 * is the same public call the rest of the app makes, shown only when allowed.
 */
export function AssetMenu({
  asset: a,
  children,
  onOpen,
  onShare,
  onPick,
  selected,
  onChanged,
}: {
  asset: Asset;
  children: React.ReactNode;
  onOpen: () => void;
  onShare: () => void;
  onPick?: () => void;
  selected?: boolean;
  onChanged: () => void;
}) {
  const can = useCan();
  const reviewer = can("asset.review", a);
  const live = a.state !== "deleted";
  const approved = a.status === "active";
  const image = hasPreview(a) && !a.mime.startsWith("video/");

  const act = async (res: Promise<Response>, done: string, undo?: () => Promise<Response>) => {
    const r = await res.catch(() => null);
    if (!r?.ok) return void toast.error((await r?.json().catch(() => null))?.error?.message ?? "That didn't work");
    onChanged();
    toast.success(done, undo && { action: { label: "Undo", onClick: () => void undo().then(onChanged) } });
  };
  const patch = (body: object) =>
    fetch(`/api/v1/assets/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const restore = () => fetch(`/api/v1/assets/${a.id}/restore`, { method: "POST" });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>{a.metadata?.title || a.filename}</ContextMenuLabel>
        <ContextMenuItem onSelect={onOpen}>
          <IconExternalLink /> Open
        </ContextMenuItem>
        {onPick && (
          <ContextMenuItem onSelect={onPick}>
            <IconSelect /> {selected ? "Deselect" : "Select"}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void copy(new URL(`/?asset=${a.id}`, location.origin).href, "a link for people with access")}>
          <IconCopy /> Copy link
        </ContextMenuItem>
        {live && (
          <ContextMenuItem onSelect={onShare}>
            <IconShare /> Share…
          </ContextMenuItem>
        )}
        {live &&
          (image ? (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <IconDownload /> Download
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-60">
                <ContextMenuItem onSelect={() => save(`/a/${a.id}?download`, a.filename)}>
                  Original
                  <span className="text-muted-foreground ml-auto text-xs">as uploaded</span>
                </ContextMenuItem>
                {PRESETS.map((p) => (
                  <ContextMenuItem key={p.name} onSelect={() => save(`/a/${a.id}/${p.spec}`, `${stem(a.filename)}-${p.name.toLowerCase().replace(/\s+/g, "-")}.${extOf(p.spec)}`)}>
                    {p.name}
                    <span className="text-muted-foreground ml-auto font-mono text-[11px]">{extOf(p.spec)}</span>
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          ) : (
            <ContextMenuItem onSelect={() => save(`/a/${a.id}?download`, a.filename)}>
              <IconDownload /> Download
            </ContextMenuItem>
          ))}
        {reviewer && live && (
          <>
            <ContextMenuSeparator />
            {(a.status === "proposed" || a.status === "draft" || (approved && suggestions(a))) && (
              <ContextMenuItem onSelect={() => void act(approve(a), approved ? "Accepted the suggestions" : "Approved")}>
                <IconCheck /> {approved ? "Accept suggestions" : "Approve"}
              </ContextMenuItem>
            )}
            {(a.state === "active" || a.state === "expired") && (
              <ContextMenuItem onSelect={() => void act(moveTo(a, "archived"), "Archived: its links stop working", () => moveTo(a, "active"))}>
                <IconArchive /> Archive
              </ContextMenuItem>
            )}
            {a.state === "archived" && (
              <ContextMenuItem onSelect={() => void act(moveTo(a, "active"), "Unarchived")}>
                <IconArrowBackUp /> Unarchive
              </ContextMenuItem>
            )}
          </>
        )}
        {approved && live && can("asset.share", a) && (
          <ContextMenuItem
            onSelect={() =>
              void act(patch({ public: !a.public }), a.public ? "Only people with access can open it now" : "Public: anyone with its URL gets the file", () =>
                patch({ public: !!a.public }),
              )
            }
          >
            {a.public ? <IconLinkOff /> : <IconLink />} {a.public ? "Stop public link" : "Make public"}
          </ContextMenuItem>
        )}
        {live && can("asset.delete", a) && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onSelect={() => void act(fetch(`/api/v1/assets/${a.id}`, { method: "DELETE" }), `Deleted ${a.filename}`, restore)}
            >
              <IconTrash /> Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
