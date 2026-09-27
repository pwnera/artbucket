"use client";

import { IconCheck, IconPhoto, IconSparkles } from "@tabler/icons-react";
import { toast } from "sonner";
import { FontThumb } from "@/components/font-preview";
import { Thumb, type Asset } from "@/components/gallery";
import { stem } from "@/components/renditions";
import { Can } from "@/components/can";
import { approve, reject } from "@/components/review-actions";
import { RejectAction } from "@/components/selection-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { fileTypeBadge, formatBytes } from "@/lib/filename";
import { isFont } from "@/lib/font";
import { ago, exact } from "@/lib/time";
import { cn } from "@/lib/utils";
import { hasPreview } from "@/lib/preview";

/**
 * The library as rows, PostHog style: denser than the grid, and the right
 * shape for deciding. In Review each row says who suggested it and when, and
 * decides it in place.
 */
export function AssetTable({
  assets,
  selected,
  selecting,
  review,
  onOpen,
  onPick,
  onChanged,
}: {
  assets: Asset[];
  selected: Set<string>;
  /** Once anything is selected, a click selects instead of opening. */
  selecting: boolean;
  review: boolean;
  onOpen: (a: Asset) => void;
  onPick: (i: number, range: boolean) => void;
  onChanged: () => void;
}) {
  async function decide(res: Promise<Response>, done: string) {
    const r = await res.catch(() => null);
    if (r?.ok) toast.success(done);
    else toast.error("Couldn't do that", { description: (await r?.json().catch(() => null))?.error?.message });
    onChanged();
    return !!r?.ok;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="text-muted-foreground bg-muted/40 text-left text-xs tracking-wide uppercase">
          <tr>
            <th className="w-10 px-3 py-2">
              <span className="sr-only">Select</span>
            </th>
            <th className="px-3 py-2 font-medium">Asset</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">Size</th>
            <th className="hidden px-3 py-2 font-medium xl:table-cell">Tags</th>
            <th className="px-3 py-2 font-medium">{review ? "Suggested by" : "Added"}</th>
            {review && (
              <th className="w-24 px-3 py-2">
                <span className="sr-only">Decide</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y">
          {assets.map((a, i) => {
            const title = a.metadata?.title || a.filename;
            return (
              <tr
                key={a.id}
                onClick={(e) => {
                  if ((e.target as Element).closest("button, a, [role=checkbox], [data-slot=popover-content]")) return;
                  if (selecting || e.metaKey || e.ctrlKey || e.shiftKey) onPick(i, e.shiftKey);
                  else onOpen(a);
                }}
                className={cn("hover:bg-muted/40 cursor-pointer", selected.has(a.id) && "bg-primary/5")}
              >
                <td className="px-3 py-2">
                  <Checkbox
                    checked={selected.has(a.id)}
                    onClick={(e) => {
                      e.preventDefault();
                      onPick(i, e.shiftKey);
                    }}
                    aria-label={`Select ${a.filename}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="bg-muted relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border">
                      {hasPreview(a) ? (
                        <Thumb src={`/a/${a.id}/w_40,f_webp`} alt="" className="p-0.5" />
                      ) : isFont(a.mime, a.filename) ? (
                        <FontThumb id={a.id} className="text-base" />
                      ) : (
                        <IconPhoto className="text-muted-foreground size-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpen(a)}
                        className="block max-w-64 truncate text-left font-medium hover:underline"
                        title={a.filename}
                      >
                        {title}
                      </button>
                      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        <span className="font-mono">{fileTypeBadge(a.filename, a.mime, a.probe)}</span>
                        {/* The filename only when it says something the title doesn't. */}
                        {title !== stem(a.filename) && title !== a.filename && <span className="max-w-56 truncate">{a.filename}</span>}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="text-muted-foreground hidden px-3 py-2 text-xs whitespace-nowrap tabular-nums md:table-cell">
                  {a.width && a.height ? `${a.width} × ${a.height} · ` : ""}
                  {formatBytes(a.size)}
                </td>
                <td className="hidden px-3 py-2 xl:table-cell">
                  <div className="flex max-w-64 items-center gap-1 overflow-hidden">
                    {a.tags.slice(0, 2).map((t) => (
                      <Badge key={t} variant="outline" className="shrink-0 font-normal">
                        {t}
                      </Badge>
                    ))}
                    {a.tags.length > 2 && <span className="text-muted-foreground shrink-0 text-xs">+{a.tags.length - 2}</span>}
                    {a.proposedTags.slice(0, 3).map((t) => (
                      <Badge key={t} variant="outline" className="border-primary/50 border-dashed font-normal" title="Suggested">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {review ? (
                    <div className="grid gap-0.5">
                      <span className="flex items-center gap-1.5">
                        <IconSparkles className="text-primary size-4" />
                        {a.proposedBy ?? "an agent"}
                      </span>
                      <span className="text-muted-foreground text-xs" title={exact(a.createdAt)} suppressHydrationWarning>
                        {a.status === "proposed" ? "New asset" : `${a.proposedTags.length} ${a.proposedTags.length === 1 ? "tag" : "tags"}`} ·{" "}
                        {ago(a.updatedAt)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs" title={exact(a.createdAt)} suppressHydrationWarning>
                      {ago(a.createdAt)}
                    </span>
                  )}
                </td>
                {review && (
                  <td className="px-3 py-2">
                    <Can do="asset.review" on={a}>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Approve ${title}`}
                        title={a.status === "proposed" ? "Approve, with its suggested tags" : "Accept the suggested tags"}
                        onClick={() => void decide(approve(a), `Approved ${title}`)}
                      >
                        <IconCheck />
                      </Button>
                      <RejectAction
                        compact
                        side="left"
                        onReject={(reason) => decide(reject(a, reason), `Rejected ${title}`)}
                      />
                    </div>
                    </Can>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
