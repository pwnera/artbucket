"use client";

import { useState } from "react";
import { IconChevronRight, IconEye, IconEyeOff, IconPhoto, IconTrash } from "@tabler/icons-react";
import { CHANGE_LABEL, useChanges } from "@/components/builder/changes";
import { endDrag, payloadOf, startDrag } from "@/components/builder/drag";
import { Thumbnail } from "@/components/builder/thumbnails";
import type { BuilderApi } from "@/components/builder/use-builder";
import { moveItem, removeItem } from "@/lib/builder-ops";
import { type Item, type Section, TEMPLATE_INFO } from "@/lib/pages";
import { cn } from "@/lib/utils";

/**
 * The page on show as layers, as a design tool lists a frame's: each
 * section by its title (else its template), and under it, folded open with
 * its chevron or when it is picked, its items. A click picks one and brings
 * it into view on the canvas; Shift or Cmd adds a section to the ones picked
 * (b.pick); a double click renames a section; the eye hides it from readers.
 * Sections drag to reorder here, or out onto the canvas or another page's
 * row as the canvas's own handle drags them (drag.ts); items drag among
 * their section's items.
 *
 * Props:
 * - b: the builder.
 */
export function Layers({ b }: { b: BuilderApi }) {
  const page = b.state.selection.page;
  const sections = b.state.pages.get(page) ?? [];
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const [itemOver, setItemOver] = useState<{ section: string; i: number; after: boolean } | null>(null);
  const [itemDrag, setItemDrag] = useState<{ section: string; i: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const picked = new Set(b.picked);
  const changes = useChanges();
  const set = (s: Section, patch: Record<string, unknown>) => b.apply({ kind: "page", page, op: { op: "update", id: s.id, set: patch } });

  if (!sections.length) return <p className="text-muted-foreground px-2 py-1 text-xs">No sections on this page yet.</p>;

  const drop = (e: React.DragEvent, id: string, after: boolean) => {
    const from = payloadOf(e);
    if (from?.kind !== "section" || from.id === id) return;
    const at = sections.findIndex((x) => x.id === id);
    const to = after ? id : (sections[at - 1]?.id ?? null);
    if (to === from.id) return;
    b.apply({ kind: "page", page, op: { op: "move", id: from.id, after: to } });
  };

  return (
    <ul aria-label="Sections on this page" className="grid gap-px">
      {sections.map((s) => {
        const on = picked.has(s.id);
        const items = s.items ?? [];
        const expanded = items.length > 0 && (open.has(s.id) || b.state.selection.section === s.id);
        const line = over?.id === s.id ? over : null;
        return (
          <li key={s.id}>
            <div
              draggable={renaming !== s.id}
              onDragStart={(e) => startDrag(e, { kind: "section", id: s.id })}
              onDragEnd={() => {
                setOver(null);
                endDrag();
              }}
              onDragOver={(e) => {
                if (payloadOf(e)?.kind !== "section") return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                const after = e.clientY > r.top + r.height / 2;
                if (line?.after !== after) setOver({ id: s.id, after });
              }}
              onDragLeave={() => setOver((o) => (o?.id === s.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (line) drop(e, s.id, line.after);
                setOver(null);
                endDrag();
              }}
              className={cn(
                "group/layer relative flex h-7 items-center gap-1 rounded-md pe-1 text-sm",
                on ? "bg-primary/10 text-foreground" : "hover:bg-muted",
                s.hidden && "text-muted-foreground",
              )}
            >
              {line && <span aria-hidden className={cn("bg-primary absolute inset-x-1 h-0.5 rounded-full", line.after ? "-bottom-px" : "-top-px")} />}
              <button
                type="button"
                aria-label={expanded ? "Fold its items" : "Show its items"}
                aria-expanded={expanded}
                disabled={!items.length}
                onClick={() => setOpen((o) => toggled(o, s.id))}
                className="text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-sm disabled:invisible"
              >
                <IconChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
              </button>
              <Thumbnail template={s.template} className="text-muted-foreground h-3.5 w-5 shrink-0" />
              {renaming === s.id ? (
                <input
                  autoFocus
                  defaultValue={s.title ?? ""}
                  placeholder={TEMPLATE_INFO[s.template].name}
                  aria-label="Section title"
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => {
                    setRenaming(null);
                    const title = e.currentTarget.value.trim();
                    if (title !== (s.title ?? "")) set(s, { title: title || null });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      e.currentTarget.value = s.title ?? "";
                      e.currentTarget.blur();
                    }
                  }}
                  className="bg-background focus-visible:ring-ring/50 h-6 min-w-0 flex-1 rounded px-1 text-sm outline-none focus-visible:ring-2"
                />
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    b.pick(s.id, { add: e.shiftKey || e.metaKey || e.ctrlKey });
                    if (!(e.shiftKey || e.metaKey || e.ctrlKey)) reveal(s.id);
                  }}
                  onDoubleClick={() => setRenaming(s.id)}
                  aria-current={on ? "true" : undefined}
                  title="Click to pick, Shift+click to add, double-click to rename"
                  className="focus-visible:ring-ring/50 min-w-0 flex-1 truncate rounded-sm text-start outline-none focus-visible:ring-2"
                >
                  {s.title || <span className="text-muted-foreground">{TEMPLATE_INFO[s.template].name}</span>}
                  {s.tab && <span className="text-muted-foreground ms-1.5 text-xs">in {s.tab}</span>}
                  {changes?.bySection.get(s.id) && (
                    <span
                      title={`${CHANGE_LABEL[changes.bySection.get(s.id)!]} since the last publish`}
                      className={cn("ms-1.5 inline-block size-1.5 rounded-full align-middle", changes.bySection.get(s.id) === "new" ? "bg-success" : "bg-warning")}
                    />
                  )}
                </button>
              )}
              <button
                type="button"
                aria-label={s.hidden ? "Show to readers" : "Hide from readers"}
                aria-pressed={s.hidden}
                title={s.hidden ? "Hidden: show to readers" : "Hide from readers"}
                onClick={() => set(s, { hidden: !s.hidden })}
                className={cn(
                  "text-muted-foreground hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded-sm",
                  !s.hidden && "opacity-0 group-hover/layer:opacity-100 focus-visible:opacity-100",
                )}
              >
                {s.hidden ? <IconEyeOff className="size-3.5" /> : <IconEye className="size-3.5" />}
              </button>
            </div>
            {expanded && (
              <ul aria-label="Its items" className="grid gap-px ps-7">
                {items.map((it, i) => {
                  const on = b.item?.section === s.id && b.item.i === i;
                  const iline = itemOver?.section === s.id && itemOver.i === i ? itemOver : null;
                  return (
                    <li
                      key={i}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(i));
                        setItemDrag({ section: s.id, i });
                      }}
                      onDragEnd={() => {
                        setItemDrag(null);
                        setItemOver(null);
                      }}
                      onDragOver={(e) => {
                        if (itemDrag?.section !== s.id) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        const after = e.clientY > r.top + r.height / 2;
                        if (iline?.after !== after) setItemOver({ section: s.id, i, after });
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (itemDrag?.section === s.id && iline) {
                          let to = i + (iline.after ? 1 : 0);
                          if (itemDrag.i < to) to--;
                          if (to !== itemDrag.i) set(s, moveItem(s, itemDrag.i, to));
                        }
                        setItemDrag(null);
                        setItemOver(null);
                      }}
                      className={cn("group/item relative flex h-6 items-center gap-1.5 rounded-md ps-1 pe-1 text-xs", on ? "bg-primary/10" : "hover:bg-muted")}
                    >
                      {iline && <span aria-hidden className={cn("bg-primary absolute inset-x-1 h-0.5 rounded-full", iline.after ? "-bottom-px" : "-top-px")} />}
                      {it.asset ? <IconPhoto aria-hidden className="text-muted-foreground size-3 shrink-0" /> : <span aria-hidden className="bg-muted-foreground/40 size-1.5 shrink-0 rounded-full" />}
                      <button
                        type="button"
                        onClick={() => {
                          b.pick(s.id);
                          b.setItem({ section: s.id, i });
                          reveal(s.id, i);
                        }}
                        className="focus-visible:ring-ring/50 min-w-0 flex-1 truncate rounded-sm text-start outline-none focus-visible:ring-2"
                      >
                        {itemName(b, it, i)}
                      </button>
                      {!b.state.lang && (
                        <button
                          type="button"
                          aria-label="Remove item"
                          title="Remove item"
                          onClick={() => {
                            set(s, removeItem(s, i));
                            if (b.item?.section === s.id) b.setItem(null);
                          }}
                          className="text-muted-foreground hover:text-destructive flex size-5 shrink-0 items-center justify-center rounded-sm opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100"
                        >
                          <IconTrash className="size-3" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const toggled = (s: Set<string>, id: string) => {
  const next = new Set(s);
  if (!next.delete(id)) next.add(id);
  return next;
};

/** An item's name in the list: its title, else its picture's, its link, or its place. */
function itemName(b: BuilderApi, it: Item, i: number) {
  return it.title || (it.asset && b.view.media[it.asset]?.title) || (it.asset && b.view.media[it.asset]?.filename) || it.caption || it.link || `Item ${i + 1}`;
}

/** A section on the canvas (ids end with its id: the canvas prefixes them), or one of its items, into view. */
export function reveal(section: string, item?: number) {
  const el = document.querySelector(`section[data-template][id$="${CSS.escape(section)}"]`);
  const target = item === undefined ? el : el?.querySelector(`[data-item-root="${item}"]`);
  target?.scrollIntoView({ block: item === undefined ? "start" : "center", behavior: "smooth" });
}
