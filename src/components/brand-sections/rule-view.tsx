"use client";

import { useRef, useState } from "react";
import {
  IconArrowDown,
  IconArrowUp,
  IconDots,
  IconGripVertical,
  IconLayoutSidebarRight,
  IconLink,
  IconNote,
  IconPencil,
  IconPlus,
  IconSquares,
  IconTrash,
} from "@/components/icons";
import { Editable, Markdown, RichText, ValueEditor } from "@/components/brand-values";
import { HEAD } from "@/components/brand-sections/look";
import { AssetTile, DoCards, LogoTile, pictured } from "@/components/brand-sections/parts";
import { Confirm } from "@/components/confirm";
import { FontStyles } from "@/components/font-preview";
import { IconButton } from "@/components/icon-button";
import { AnchorLink } from "@/components/site/anchors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fontFiles, isFontAsset } from "@/lib/font";
import { keyFor } from "@/lib/presets";
import { contextLabel, listStyle, ruleName, section, type Rule } from "@/lib/rules";
import { cn } from "@/lib/utils";

/** Where the line a drag draws sits: above a block or below it. */
export type Line = "before" | "after";

/** What an edit changes. */
export type Patch = Partial<Pick<Rule, "value" | "usage" | "assets">>;

export type Dnd = {
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: React.DragEventHandler<HTMLDivElement>;
  onDrop: React.DragEventHandler<HTMLDivElement>;
};

/** What a block can do for someone who may edit: everything the page does to one rule. */
export type Ed = {
  /** Every key on the page: what the name's preview counts up against. */
  taken: Set<string>;
  resets: number;
  /** Every variant made on this visit: Backspace in its emptied name deletes it. */
  fresh: boolean;
  /** A context view's label: a rule shown from the default there belongs to every context. */
  context?: string;
  canMove: [boolean, boolean];
  dnd: Dnd;
  onPatch: (r: Rule, body: Patch) => void;
  onRename: (r: Rule, name: string) => void;
  /** The name field was left: whatever waited for the name can go. */
  onNamed: (r: Rule) => void;
  onDelete: (r: Rule) => Promise<boolean>;
  onDetails: (id: string, kb: boolean) => void;
  onInsert: () => void;
  onDuplicate: () => void;
  onMove: (step: -1 | 1) => void;
  onCopyLink: () => void;
};

// ---- blocks in the DOM --------------------------------------------------------

/** Runs `fn` on what `find` finds once React has drawn it, waiting a few frames at most. */
export function onceDrawn(find: () => HTMLElement | null | undefined, fn: (el: HTMLElement) => void, tries = 30) {
  const el = find();
  if (el) fn(el);
  else if (tries > 0) requestAnimationFrame(() => onceDrawn(find, fn, tries - 1));
}

const FIELD = "input:not([type=hidden]), textarea, [contenteditable=true], button";

/** The first place to type in a block's name, value or note. */
export function fieldIn(block: Element | null | undefined, where: "name" | "value" | "note") {
  const f = block?.querySelector<HTMLElement>(`[data-field=${where}]`);
  return f?.matches(FIELD) ? f : (f?.querySelector<HTMLElement>(FIELD) ?? null);
}

/** A rule's block, where the editor anchors it (`rule-{key}`). */
const blockOf = (key: string) => document.getElementById(`rule-${key}`);
/** Every block on the page, top to bottom, across sections. */
export const blocks = () => [...document.querySelectorAll<HTMLElement>("[data-block]")];

/** The caret in a rule's name (its text selected), value or note, or the block itself selected; then `then`, a frame later. */
function focusRule(key: string, where: "block" | "name" | "value" | "note", then?: () => void) {
  const done = () => then && requestAnimationFrame(then);
  if (where === "block" || where === "note")
    return onceDrawn(
      () => blockOf(key),
      (b) => {
        b.focus();
        if (where === "block") return done();
        // An empty note shows only while its block holds focus: select the block, then step in once it shows.
        requestAnimationFrame(() =>
          onceDrawn(
            () => fieldIn(b, "note"),
            (f) => {
              f.focus();
              done();
            },
          ),
        );
      },
    );
  onceDrawn(
    () => fieldIn(blockOf(key), where),
    (f) => {
      f.focus();
      if (f instanceof HTMLTextAreaElement) f.select();
      done();
    },
  );
}

/** What the note under a rule is for, by section: an empty note says what to write. */
const USAGE_HINT: Record<string, string> = {
  color: "Where it goes: buttons, links, backgrounds",
  logo: "When this applies, and why",
  type: "Where each is used",
  tone: "An example, or why it matters",
};

/** A rule's variants, one of them shown: Default, Dark background. Arrows move between them, as radios do. */
function Variants({ rules, current, onPick }: { rules: Rule[]; current: Rule; onPick: (id: string) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Variants"
      className="flex flex-wrap gap-1"
      onKeyDown={(e) => {
        const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!d) return;
        // Not the block's arrows, which walk the page.
        e.preventDefault();
        e.stopPropagation();
        const i = (rules.findIndex((x) => x.id === current.id) + d + rules.length) % rules.length;
        onPick(rules[i].id);
        e.currentTarget.querySelectorAll<HTMLElement>("[role=radio]")[i]?.focus();
      }}
    >
      {rules.map((x) => {
        const on = x.id === current.id;
        return (
          <Tooltip key={x.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => onPick(x.id)}
                className={cn(
                  "inline-flex h-6 items-center rounded-full px-2.5 text-xs transition-colors",
                  on ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {x.context ? contextLabel(x.context) : "Default"}
              </button>
            </TooltipTrigger>
            <TooltipContent>{x.context ? `Only in ${contextLabel(x.context)}` : "Everywhere without its own variant"}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * A rule as the guidelines show it, and as it is edited: its name, its value
 * as a specimen, its note and assets, its variants a click apart. With `ed`,
 * each part is its own editor, a Notion block: the gutter holds + and the
 * handle that drags it and opens its menu, and the block takes the keyboard
 * when selected (Esc from a field). Without, it only reads (a portal).
 */
export function RuleView({
  rules,
  anchor,
  inherited,
  entering,
  selected,
  line,
  dragging,
  stacked,
  ed,
}: {
  /** One key's rules: the default first, then its context variants. */
  rules: Rule[];
  /** The block's id, and its copy-link: `rule-{key}` in the editor, and on the first specimen of a key on a page. */
  anchor?: string;
  /** A context view showing the default: what every context shares. */
  inherited?: boolean;
  /** Made on this visit: it arrives rather than appears. */
  entering?: boolean;
  /** The variant open in Details. */
  selected?: string;
  line: Line | null;
  dragging: boolean;
  /** A color card in a palette grid. */
  stacked?: boolean;
  ed?: Ed;
}) {
  const [shown, setShown] = useState(rules[0].id);
  // Picking a variant crossfades the specimen; the page's first paint doesn't.
  const [swapped, setSwapped] = useState(false);
  const r = rules.find((x) => x.id === (selected ?? shown)) ?? rules[0];
  const block = useRef<HTMLDivElement>(null);
  const grip = useRef<HTMLButtonElement>(null);
  const dots = useRef<HTMLButtonElement>(null);
  // The block menu; `kb`: opened from the keyboard, so Details takes the focus.
  const [menu, setMenu] = useState<{ kb: boolean } | null>(null);
  // Where focus goes as the menu closes: what the item chose, else back to the handle.
  const then = useRef<(() => void) | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The name as typed, while its field has focus: the key it becomes shows under it.
  const [naming, setNaming] = useState<string | null>(null);
  const others = r.assets.filter((a) => !isFontAsset(a));
  const pics = others.filter(pictured);
  const look = r.type === "list" ? listStyle(r.key, r.value as (string | number)[]) : null;
  // Shown from the default in a context view: deleting it deletes it for every context, so it asks.
  const shared = !!ed?.context && r.context === null;
  const nameKey = ed && naming !== null ? keyFor(section(r.key), naming, new Set([...ed.taken].filter((k) => k !== r.key))) : null;

  /** Delete, with the undo toast. `move`: focus goes on to the next block, not down to the page. */
  function del(move = !!block.current?.contains(document.activeElement)) {
    if (!ed) return;
    if (shared) return setConfirming(true);
    const el = block.current;
    const all = blocks();
    const i = el ? all.indexOf(el) : -1;
    const next = all[i + 1] ?? all[i - 1];
    void ed.onDelete(r);
    // remove() marks a block that is leaving at once.
    if (move && el?.hasAttribute("data-leaving")) next?.focus();
  }

  // Notion's block selection: arrows walk the page; the rest act on the block.
  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const mod = e.metaKey || e.ctrlKey;
    const arrow = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (arrow && !mod && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const all = blocks();
      return all[all.indexOf(e.currentTarget) + arrow]?.focus();
    }
    if (!ed) return;
    if (arrow && mod && e.shiftKey) {
      e.preventDefault();
      ed.onMove(arrow);
    } else if (e.key === "Enter") {
      e.preventDefault();
      fieldIn(e.currentTarget, "name")?.focus();
    } else if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      ed.onDuplicate();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      del(true);
    } else if (e.key === "/") {
      e.preventDefault();
      ed.onInsert();
    }
  }

  return (
    <div
      ref={block}
      data-block
      id={anchor}
      tabIndex={-1}
      onKeyDown={onKey}
      onDragOver={ed?.dnd.onDragOver}
      onDrop={ed?.dnd.onDrop}
      className={cn(
        "group/block @container relative -mx-2 scroll-mt-20 space-y-3 rounded-lg px-2 py-3 transition-colors outline-none",
        "focus-visible:bg-primary/5 focus-visible:ring-ring/40 focus-visible:ring-2",
        entering && "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200",
        // Set by remove() for the 150ms before the rule leaves the list.
        "motion-safe:data-leaving:animate-out motion-safe:data-leaving:fade-out-0 motion-safe:data-leaving:zoom-out-95 data-leaving:fill-mode-forwards data-leaving:duration-150",
        selected && "bg-muted/40 ring-border ring-1",
        dragging && "opacity-40",
      )}
    >
      {line && (
        // Centered in the 16px gap between blocks.
        <div
          aria-hidden
          className={cn("bg-primary pointer-events-none absolute inset-x-0 h-0.5 rounded-full", line === "before" ? "-top-[9px]" : "-bottom-[9px]")}
        />
      )}
      {ed && (
        // The gutter: on touch always there, with a mouse on hover or focus. Below sm the dots in the name row stand in.
        // Viewport sm, not a container query: the rules sheet (builder/rules-sheet.tsx) leaves the gutter its room.
        <div className="absolute top-3.5 -start-12 hidden gap-0.5 transition-opacity sm:flex pointer-fine:opacity-0 pointer-fine:group-focus-within/block:opacity-100 pointer-fine:group-hover/block:opacity-100">
          <IconButton variant="ghost" size="icon-xs" label="Add below" shortcut={["/"]} className="text-muted-foreground" onClick={ed.onInsert}>
            <IconPlus className="size-4" />
          </IconButton>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                ref={grip}
                type="button"
                draggable
                aria-label="Drag to move, or click for options"
                aria-haspopup="menu"
                aria-expanded={!!menu}
                // A click never follows a drag: click for the menu, drag to move.
                onClick={(e) => setMenu({ kb: e.detail === 0 })}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", r.key);
                  if (block.current) e.dataTransfer.setDragImage(block.current, 16, 16);
                  ed.dnd.onDragStart();
                }}
                onDragEnd={ed.dnd.onDragEnd}
                className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-6 cursor-grab items-center justify-center rounded-md transition-colors active:cursor-grabbing"
              >
                <IconGripVertical className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Drag to move · Click for options</TooltipContent>
          </Tooltip>
        </div>
      )}
      {ed && (
        // Controlled, from the handle's click: a Radix trigger opens on pointerdown, which would open it at every drag.
        <DropdownMenu open={!!menu} onOpenChange={(o) => !o && setMenu(null)}>
          <DropdownMenuTrigger asChild>
            <span aria-hidden className="pointer-events-none absolute top-10 start-2 size-0 sm:-start-6" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-60"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              const f = then.current;
              then.current = null;
              if (f) f();
              else (grip.current?.offsetParent ? grip.current : dots.current)?.focus();
            }}
          >
            <DropdownMenuItem
              onSelect={() => {
                // Details takes the focus itself.
                then.current = () => {};
                ed.onDetails(r.id, !!menu?.kb);
              }}
            >
              <IconLayoutSidebarRight /> Details...
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => (then.current = () => focusRule(r.key, "note"))}>
              <IconNote /> {r.usage ? "Edit the note" : "Add a note"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => (then.current = ed.onDuplicate)}>
              <IconSquares /> Duplicate
              <DropdownMenuShortcut>
                <Kbd keys={["mod", "D"]} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={ed.onCopyLink}>
              <IconLink /> Copy link
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!ed.canMove[0]} onSelect={() => ed.onMove(-1)}>
              <IconArrowUp /> Move up
              <DropdownMenuShortcut>
                <Kbd keys={["mod", "⇧", "↑"]} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!ed.canMove[1]} onSelect={() => ed.onMove(1)}>
              <IconArrowDown /> Move down
              <DropdownMenuShortcut>
                <Kbd keys={["mod", "⇧", "↓"]} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => (then.current = () => del(true))}>
              <IconTrash />
              {shared ? "Delete for every context" : rules.length > 1 ? `Delete ${r.context ? contextLabel(r.context) : "default"}` : "Delete"}
              <DropdownMenuShortcut>
                <Kbd keys={["⌫"]} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {ed && shared && (
        <Confirm
          open={confirming}
          onOpenChange={setConfirming}
          title={`Delete ${ruleName(r)} for every context?`}
          says={`${ed.context} shows the default, which every context shares. Deleting it takes it from all of them.`}
          action="Delete for every context"
          run={() => ed.onDelete(r)}
        />
      )}

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className={cn(HEAD, "max-w-full text-lg")}>
          {ed ? (
            <Editable
              key={ed.resets}
              field="name"
              value={ruleName(r)}
              label="Name"
              // The field's -mx-1 makes it 0.5rem wider than the h3 it sizes, so max-w-full would wrap its last letter.
              className="w-auto max-w-[calc(100%+0.5rem)] min-w-8"
              // Only on Enter or leaving, never as you type: a new name is a new key.
              onSave={(v) => v && ed.onRename(r, v)}
              onFocus={() => setNaming(ruleName(r))}
              onDraft={setNaming}
              onBlur={() => {
                setNaming(null);
                ed.onNamed(r);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  // On to the value, which commits the name as it leaves it.
                  const f = fieldIn(block.current, "value");
                  if (!f) return;
                  e.preventDefault();
                  f.focus();
                } else if (e.key === "Backspace" && !e.currentTarget.value && ed.fresh) {
                  // Nothing knows a rule made this visit yet: an emptied name takes it away, as in Notion.
                  e.preventDefault();
                  del(true);
                }
              }}
            />
          ) : (
            ruleName(r)
          )}
        </h3>
        {anchor && <AnchorLink id={anchor} label={`Copy a link to ${ruleName(r)}`} className="self-center group-hover/block:opacity-100" />}
        {rules.length > 1 ? (
          <Variants
            rules={rules}
            current={r}
            onPick={(id) => {
              setSwapped(true);
              if (selected && ed) ed.onDetails(id, false);
              else setShown(id);
            }}
          />
        ) : r.context ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" tabIndex={0}>
                {contextLabel(r.context)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Only in {contextLabel(r.context)}</TooltipContent>
          </Tooltip>
        ) : (
          inherited && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" tabIndex={0}>
                  From default
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Shared by every context</TooltipContent>
            </Tooltip>
          )
        )}
        {ed && (
          <IconButton
            ref={dots}
            variant="ghost"
            size="icon-xs"
            label="Options"
            className="text-muted-foreground ms-auto self-center sm:hidden"
            onClick={(e) => setMenu({ kb: e.detail === 0 })}
          >
            <IconDots className="size-4" />
          </IconButton>
        )}
      </div>
      {/* The key a name becomes lives in Details and the rename prompt, not under every name you type. */}
      {naming !== null && !nameKey && <p className="text-2xs text-destructive -mt-1">A name needs a letter in it</p>}
      <div
        key={r.id}
        data-field="value"
        className={cn(swapped && "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150")}
      >
        <ValueEditor
          key={`${r.id}:${ed?.resets}`}
          rule={r}
          stacked={stacked}
          onSave={(value) => ed?.onPatch(r, { value })}
          onEmpty={ed && (() => del(true))}
        />
      </div>
      {ed ? (
        // An empty note shows while the block has focus, so Tab runs name, value, note, and empty notes add nothing to read.
        <div data-field="note" className={cn(!r.usage && "hidden group-focus-within/block:block")}>
          <RichText
            key={`${r.id}:${ed.resets}`}
            value={r.usage ?? ""}
            label="Note"
            placeholder={USAGE_HINT[section(r.key)] ?? "When and how to use it"}
            className="text-muted-foreground text-sm"
            onSave={(usage) => ed.onPatch(r, { usage: usage || null })}
          />
        </div>
      ) : (
        r.usage && <Markdown text={r.usage} className="text-muted-foreground text-sm" demote />
      )}
      {r.type === "font" && fontFiles(r).length > 0 && (
        <FontStyles files={fontFiles(r)} download={(r.spec as { download?: boolean } | null)?.download !== false} />
      )}
      {pics.length > 0 &&
        (look === "do" || look === "dont" ? (
          <DoCards assets={pics} look={look} />
        ) : (
          // Logos and imagery: big, on the backdrop of your choice, a download away.
          <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3">
            {pics.map((a) => (
              <LogoTile key={a.id} asset={a} dark={!!r.context && /dark/.test(r.context)} />
            ))}
          </div>
        ))}
      {(others.length > pics.length || (ed && others.length > 0)) && (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          {others
            .filter((a) => !pictured(a))
            .map((a) => (
              <AssetTile key={a.id} asset={a} />
            ))}
          {ed && (
            <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={(e) => ed.onDetails(r.id, e.detail === 0)}>
              <IconPencil /> Edit assets
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
