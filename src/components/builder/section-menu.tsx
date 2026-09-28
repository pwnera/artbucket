"use client";

import {
  IconAdjustmentsHorizontal,
  IconArrowBarToDown,
  IconArrowBarToUp,
  IconArrowDown,
  IconArrowUp,
  IconClipboard,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconFileArrowRight,
  IconLayoutGrid,
  IconPhoto,
  IconPlus,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconScissors,
  IconTrash,
} from "@tabler/icons-react";
import { blankItem } from "@/components/builder/items";
import { choiceLabel, COLUMNS, GROUNDS, templateOptions, variantOf, WIDTHS } from "@/components/builder/section-toolbar";
import { starter } from "@/components/builder/seam";
import { Thumbnail } from "@/components/builder/thumbnails";
import type { BuilderApi } from "@/components/builder/use-builder";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { duplicateItem, insertItems, moveItem, removeItem } from "@/lib/builder-ops";
import { type Section, TEMPLATE_INFO, TEMPLATES, type Template } from "@/lib/pages";
import { withProp } from "@/lib/template-fields";

/**
 * What a right click on a section offers (the canvas opens it on the
 * section, or on one of its items): the item's own actions first, then the
 * section's. Everything is a builder action the toolbar and the keys also
 * reach, so the menu is only a quicker way to them, one right click from
 * wherever the pointer is.
 *
 * Props:
 * - b: the builder.
 * - s: the section, as stored.
 * - item: the item right clicked, by index; null on the section itself.
 * - onPictures: pick pictures from the library, for new items at `at`, or
 *   to replace item `at`'s.
 */
export type SectionMenuProps = {
  b: BuilderApi;
  s: Section;
  item: number | null;
  onPictures(at: number, replace: boolean): void;
};

export function SectionMenu({ b, s, item, onPictures }: SectionMenuProps) {
  const page = b.state.selection.page;
  const list = b.state.pages.get(page) ?? [];
  const at = list.findIndex((x) => x.id === s.id);
  const set = (patch: Record<string, unknown>) => b.apply({ kind: "page", page, op: { op: "update", id: s.id, set: patch } });
  const moveTo = (after: string | null) => b.apply({ kind: "page", page, op: { op: "move", id: s.id, after } });
  const insert = (t: Template, after: string | null) => b.insert(starter(t, b.state.rules, b.view.brand.name, b.state.nav.map((p) => p.slug), s.tab), after);
  const before = at > 0 ? list[at - 1].id : null;
  const variant = variantOf(s.template);
  const pages = b.state.nav.filter((p) => p.slug !== page);

  return (
    <ContextMenuContent className="app-tokens w-60 font-sans" onCloseAutoFocus={(e) => e.preventDefault()}>
      {item !== null && <ItemPart b={b} s={s} i={item} set={set} onPictures={onPictures} />}

      <ContextMenuLabel>{TEMPLATE_INFO[s.template].name} section</ContextMenuLabel>
      <ContextMenuItem
        onSelect={() => {
          b.select({ section: s.id, rule: null });
          b.setDock("section");
        }}
      >
        <IconAdjustmentsHorizontal /> Settings
      </ContextMenuItem>
      <TemplatesSub label="Insert above" icon={<IconRowInsertTop />} onPick={(t) => insert(t, before)} />
      <TemplatesSub label="Insert below" icon={<IconRowInsertBottom />} onPick={(t) => insert(t, s.id)} />
      <ContextMenuSeparator />

      <ContextMenuItem onSelect={() => b.copy(s.id)}>
        <IconCopy /> Copy <ContextMenuShortcut>⌘C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => {
          b.copy(s.id);
          b.removeSection(s.id);
        }}
      >
        <IconScissors /> Cut <ContextMenuShortcut>⌘X</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => void b.paste(s.id)}>
        <IconClipboard /> Paste below <ContextMenuShortcut>⌘V</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => b.duplicate(s.id)}>
        <IconCopy /> Duplicate <ContextMenuShortcut>⌘D</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Thumbnail template={s.template} className="text-muted-foreground h-4 w-5" /> Template
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="app-tokens max-h-80 w-64 font-sans">
          {templateOptions(b, s).map((o) => (
            <ContextMenuItem key={o.t} disabled={!!o.why || o.t === s.template} onSelect={() => o.set && set(o.set)} className="items-start">
              <Thumbnail template={o.t} className="bg-muted mt-0.5 h-5 w-8 shrink-0 rounded-sm p-0.5" />
              <span className="grid min-w-0">
                <span>{TEMPLATE_INFO[o.t].name}</span>
                {o.why && <span className="text-muted-foreground text-xs">{o.why}</span>}
              </span>
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      {variant && (
        <Radios
          label={variant.label}
          icon={<IconLayoutGrid />}
          value={(s.props[variant.name] as string | undefined) ?? variant.fallback}
          options={variant.options.map((o) => [o, choiceLabel(o)])}
          onPick={(v) => set({ props: withProp(s.props, variant, v) })}
        />
      )}
      <Radios label="Width" value={s.width} options={WIDTHS.map(([w, , label]) => [w, label])} onPick={(width) => set({ width })} />
      {COLUMNS[s.template] && (
        <Radios
          label="Columns"
          value={String(s.columns)}
          options={Array.from({ length: COLUMNS[s.template]! }, (_, i) => [String(i + 1), String(i + 1)])}
          onPick={(v) => set({ columns: Number(v) })}
        />
      )}
      <Radios
        label="Ground"
        value={s.tone}
        options={GROUNDS.filter(([t]) => t !== "pattern" || b.view.theme.device).map(([t, label]) => [t, label])}
        onPick={(tone) => set({ tone, background: null })}
      />
      <ContextMenuSeparator />

      <ContextMenuItem disabled={at <= 0} onSelect={() => b.nudge(s.id, -1)}>
        <IconArrowUp /> Move up <ContextMenuShortcut>⌥↑</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={at < 0 || at >= list.length - 1} onSelect={() => b.nudge(s.id, 1)}>
        <IconArrowDown /> Move down <ContextMenuShortcut>⌥↓</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={at <= 0} onSelect={() => moveTo(null)}>
        <IconArrowBarToUp /> Move to the top
      </ContextMenuItem>
      <ContextMenuItem disabled={at < 0 || at >= list.length - 1} onSelect={() => moveTo(list.at(-1)!.id)}>
        <IconArrowBarToDown /> Move to the bottom
      </ContextMenuItem>
      {pages.length > 0 && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <IconFileArrowRight /> Move to page
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="app-tokens max-h-80 font-sans">
            {pages.map((p) => (
              <ContextMenuItem key={p.slug} onSelect={() => void b.moveToPage(s.id, p.slug)}>
                {p.title}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}
      <ContextMenuSeparator />

      <ContextMenuItem onSelect={() => set({ hidden: !s.hidden })}>
        {s.hidden ? <IconEye /> : <IconEyeOff />} {s.hidden ? "Show to readers" : "Hide from readers"}
      </ContextMenuItem>
      <ContextMenuItem variant="destructive" onSelect={() => b.removeSection(s.id)}>
        <IconTrash /> Delete <ContextMenuShortcut>⌫</ContextMenuShortcut>
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

/** A submenu of choices, the current one marked. */
function Radios({ label, icon, value, options, onPick }: { label: string; icon?: React.ReactNode; value: string; options: [string, string][]; onPick(v: string): void }) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        {icon ?? <span className="size-4" />} {label}
        <span className="text-muted-foreground ms-auto truncate text-xs">{options.find(([v]) => v === value)?.[1]}</span>
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="app-tokens font-sans">
        <ContextMenuRadioGroup value={value} onValueChange={onPick}>
          {options.map(([v, l]) => (
            <ContextMenuRadioItem key={v} value={v}>
              {l}
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

/** Every template, to put a new section in with. */
function TemplatesSub({ label, icon, onPick }: { label: string; icon: React.ReactNode; onPick(t: Template): void }) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        {icon} {label}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="app-tokens max-h-80 w-56 font-sans">
        {TEMPLATES.map((t) => (
          <ContextMenuItem key={t} onSelect={() => onPick(t)}>
            <Thumbnail template={t} className="bg-muted h-5 w-8 shrink-0 rounded-sm p-0.5" />
            {TEMPLATE_INFO[t].name}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

/** An item's actions: add one beside it, copy, move, its picture, its settings, remove. */
function ItemPart({ b, s, i, set, onPictures }: { b: BuilderApi; s: Section; i: number; set(patch: Record<string, unknown>): void; onPictures: SectionMenuProps["onPictures"] }) {
  const items = s.items ?? [];
  const blank = blankItem(s, b.state.rules, b.state.nav.map((p) => p.slug));
  const add = (at: number) => {
    if (!blank) return;
    if (blank.kind === "asset") onPictures(at, false);
    else set(insertItems(s, at, [blank.item]));
  };
  return (
    <>
      <ContextMenuLabel>Item {i + 1}</ContextMenuLabel>
      {blank && (
        <>
          <ContextMenuItem onSelect={() => add(i)}>
            <IconPlus /> Add one before
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => add(i + 1)}>
            <IconPlus /> Add one after
          </ContextMenuItem>
        </>
      )}
      <ContextMenuItem onSelect={() => set(duplicateItem(s, i))}>
        <IconCopy /> Duplicate item
      </ContextMenuItem>
      <ContextMenuItem disabled={i === 0} onSelect={() => set(moveItem(s, i, i - 1))}>
        <IconArrowUp /> Move earlier
      </ContextMenuItem>
      <ContextMenuItem disabled={i >= items.length - 1} onSelect={() => set(moveItem(s, i, i + 1))}>
        <IconArrowDown /> Move later
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onPictures(i, true)}>
        <IconPhoto /> {items[i]?.asset ? "Change picture" : "Add a picture"}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => {
          b.select({ section: s.id, rule: null });
          b.setItem({ section: s.id, i });
          b.setDock("section");
        }}
      >
        <IconAdjustmentsHorizontal /> Item settings
      </ContextMenuItem>
      <ContextMenuItem variant="destructive" onSelect={() => set(removeItem(s, i))}>
        <IconTrash /> Remove item
      </ContextMenuItem>
      <ContextMenuSeparator />
    </>
  );
}
