"use client";

import { IconCheck, IconPhoto, IconSparkles } from "@/components/icons";
import { FontThumb } from "@/components/font-preview";
import { GLYPH_INK, reviewChips, stateBadge, Thumb, wellClass, type Asset } from "@/components/gallery";
import { IconGlyph } from "@/components/icon-glyph";
import { stem } from "@/components/renditions";
import { Can, useCan } from "@/components/can";
import { AssetMenu, type ActionContext } from "@/components/asset-menu";
import { IconButton } from "@/components/icon-button";
import { approve, reject, suggestions } from "@/components/review-actions";
import { decideLater, RejectAction, useReviewCount, type Patch } from "@/components/selection-bar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { fileTypeBadge, formatBytes } from "@/lib/filename";
import { isFont } from "@/lib/font";
import { ago, exact } from "@/lib/time";
import { cn } from "@/lib/utils";
import { hasPreview, isIcon, isMono } from "@/lib/preview";
import { collapse } from "@/lib/motion";

/**
 * The library as rows, PostHog style: denser than the grid, and the right
 * shape for deciding. In Review each row says who suggested it and when, and
 * decides it in place: A approves, R rejects, J and K move, and a decision
 * can be undone for 8s. Rows move with the same keys as the grid's tiles.
 */
export function AssetTable({
  assets,
  selected,
  selecting,
  review,
  cursor,
  well,
  onCursor,
  onKeyDown,
  menu,
  onOpen,
  onPick,
  patch,
  onChanged,
}: {
  assets: Asset[];
  selected: Set<string>;
  /** Once anything is selected, a click selects instead of opening. */
  selecting: boolean;
  review: boolean;
  /** The row that takes Tab: an asset id. */
  cursor: string | null;
  /** The thumbnails' backdrop (components/gallery.tsx WELLS). */
  well: string;
  onCursor: (id: string) => void;
  /** The grid's keys: arrows, Enter, X, Delete. */
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  /** What a row's context menu acts with. */
  menu: (a: Asset) => ActionContext;
  onOpen: (a: Asset) => void;
  onPick: (a: Asset, range: boolean) => void;
  patch?: Patch;
  onChanged: () => void;
}) {
  const can = useCan();
  const tab = assets.some((a) => a.id === cursor) ? cursor : assets[0]?.id;
  const onCount = useReviewCount();
  const decide = (a: Asset, verdict: "approve" | "reject", reason = "") => {
    const title = a.metadata?.title || a.filename;
    // The row leaves tinted with its verdict, green or red, before the list closes over it.
    const row = document.querySelector(`tr[data-cursor="${CSS.escape(a.id)}"]`);
    row?.setAttribute("data-verdict", verdict);
    collapse(row, () =>
      decideLater(
        `${verdict === "approve" ? "Approved" : "Rejected"} ${title}`,
        [a],
        verdict === "approve" ? approve : (x) => reject(x, reason),
        { patch, onDone: onChanged, onCount },
      ),
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="group/well w-full text-sm" data-well={well}>
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
        <tbody
          className="divide-y"
          onKeyDown={(e) => {
            const row = e.target as HTMLElement;
            const a = row.dataset.cursor ? assets.find((x) => x.id === row.dataset.cursor) : undefined;
            if (review && a && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "a" || e.key === "r") && can("asset.review", a)) {
              e.preventDefault();
              // The next row takes focus before this one leaves, so triage keeps its place.
              const next = (row.nextElementSibling ?? row.previousElementSibling) as HTMLElement | null;
              if (next?.dataset.cursor) {
                next.focus();
                onCursor(next.dataset.cursor);
              }
              decide(a, e.key === "a" ? "approve" : "reject");
              return;
            }
            onKeyDown(e);
          }}
        >
          {assets.map((a) => {
            const title = a.metadata?.title || a.filename;
            const badge = stateBadge(a);
            const chips = reviewChips(a);
            return (
              <AssetMenu key={a.id} asset={a} {...menu(a)}>
                <tr
                  data-cursor={a.id}
                  tabIndex={a.id === tab ? 0 : -1}
                  aria-selected={selected.has(a.id)}
                  onFocus={(e) => e.target === e.currentTarget && onCursor(a.id)}
                  onClick={(e) => {
                    if ((e.target as Element).closest("button, a, [role=checkbox], [data-slot=popover-content]")) return;
                    if (selecting || e.metaKey || e.ctrlKey || e.shiftKey) onPick(a, e.shiftKey);
                    else onOpen(a);
                  }}
                  className={cn(
                    "hover:bg-muted/40 data-[state=open]:bg-muted/60 cursor-pointer -outline-offset-2",
                    selected.has(a.id) && "bg-primary/5",
                  )}
                >
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={selected.has(a.id)}
                      tabIndex={-1}
                      onClick={(e) => {
                        e.preventDefault();
                        onPick(a, e.shiftKey);
                      }}
                      aria-label={`Select ${a.filename}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn("relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border", wellClass(a))}>
                        {isIcon(a) ? (
                          <span className={cn("flex", GLYPH_INK)}>
                            <IconGlyph src={`/a/${a.id}`} mono={isMono(a)} className="size-5" />
                          </span>
                        ) : hasPreview(a) ? (
                          <Thumb src={`/a/${a.id}/w_40,f_webp`} alt="" className="p-0.5" />
                        ) : isFont(a.mime, a.filename) ? (
                          <FontThumb id={a.id} className="text-base" />
                        ) : (
                          <IconPhoto className="text-muted-foreground size-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        {/* The row is the tab stop; Enter on it opens. */}
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => onOpen(a)}
                          className="block max-w-64 truncate text-left font-medium hover:underline"
                          title={a.filename}
                        >
                          {title}
                        </button>
                        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                          <span className="font-mono">
                            {fileTypeBadge(a.filename, a.mime, a.probe)}
                            {badge.version && ` ${badge.version}`}
                          </span>
                          {badge.state && (
                            <Badge variant="secondary" className="text-2xs h-4 px-1.5">
                              {badge.state}
                            </Badge>
                          )}
                          {!review && badge.suggested && (
                            <Badge className="text-2xs h-4 px-1.5">
                              <IconSparkles /> {badge.suggested}
                            </Badge>
                          )}
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
                          <IconSparkles className="text-primary-ink size-4" />
                          {a.proposedBy === "web" ? "Someone on the web" : (a.proposedBy ?? "an agent")}
                        </span>
                        <span className="text-muted-foreground text-xs" title={exact(a.updatedAt)} suppressHydrationWarning>
                          {a.status !== "proposed" ? suggestions(a) : a.version && a.version > 1 ? `New version, v${a.version}` : "New asset"} ·{" "}
                          {ago(a.updatedAt)}
                        </span>
                        {(chips.from.length > 0 || chips.missing) && (
                          <span className="flex flex-wrap gap-1">
                            {chips.from.map((c) => (
                              <Badge key={c} variant="outline" className="text-2xs h-4 px-1.5 font-normal">
                                {c}
                              </Badge>
                            ))}
                            {chips.missing && (
                              <Badge variant="outline" className="text-2xs border-destructive/50 text-destructive h-4 px-1.5 font-normal">
                                {chips.missing}
                              </Badge>
                            )}
                          </span>
                        )}
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
                          <IconButton
                            variant="ghost"
                            label={a.status === "proposed" ? "Approve, with what was suggested for it" : "Accept what was suggested"}
                            shortcut={["A"]}
                            tabIndex={-1}
                            onClick={() => decide(a, "approve")}
                          >
                            <IconCheck />
                          </IconButton>
                          <RejectAction
                            compact
                            side="left"
                            onReject={async (reason) => {
                              decide(a, "reject", reason);
                              return true;
                            }}
                          />
                        </div>
                      </Can>
                    </td>
                  )}
                </tr>
              </AssetMenu>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
