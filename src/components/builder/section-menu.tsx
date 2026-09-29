"use client";

import {
  IconAdjustmentsHorizontal,
  IconArrowBarToDown,
  IconArrowBarToUp,
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
  IconClipboard,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconFileArrowRight,
  IconLayoutGrid,
  IconPhoto,
  IconPhotoOff,
  IconPlus,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconScissors,
  IconSquareDashed,
  IconTrash,
} from "@tabler/icons-react";
import { blankItem, PICTURED } from "@/components/builder/items";
import { choiceLabel, COLUMNS, GROUNDS, pictureFields, templateOptions, variantOf, WIDTHS } from "@/components/builder/section-toolbar";
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
 * section, or on one of its items), as a design tool's menu does: what was
 * right clicked, and nothing else at the top level. On an item, the item's
 * own actions, a way up to its section, and the section's actions in a
 * submenu; on the section, its own, its picture first where it has one.
 * Everything is a builder action the toolbars and the keys also reach, so
 * the menu is only a quicker way to them, one right click from wherever the
 * pointer is.
 *
 * Props:
 * - b: the builder.
 * - s: the section, as stored.
 * - item: the item right clicked, by index; null on the section itself.
 * - onPictures: pick pictures from the library, for new items at `at`, or
 *   to replace item `at`'s.
 * - onSectionPicture: pick the section's own picture (its `prop`) from the library.
 */
export type SectionMenuProps = {
  b: BuilderApi;
  s: Section;
  item: number | null;
  onPictures(at: number, replace: boolean): void;
  onSectionPicture(prop: string): void;
};

export function SectionMenu({ b, s, item, onPictures, onSectionPicture }: SectionMenuProps) {
  return (
    <ContextMenuContent className="app-tokens w-60 font-sans" onCloseAutoFocus={(e) => e.preventDefault()}>
      {item !== null ? (
        // As Figma does for a layer in a frame: the item's own actions, and its section's one level down.
        <>
          <ItemPart b={b} s={s} i={item} onPictures={onPictures} />
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => b.setItem(null)}>
            <IconSquareDashed /> Select the section <ContextMenuShortcut>Esc</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Thumbnail template={s.template} className="text-muted-foreground h-4 w-5" /> {TEMPLATE_INFO[s.template].name} section
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="app-tokens w-60 font-sans">
              <SectionPart b={b} s={s} onSectionPicture={onSectionPicture} />
            </ContextMenuSubContent>
          </ContextMenuSub>
        </>
      ) : (
        <>
          <ContextMenuLabel>{TEMPLATE_INFO[s.template].name} section</ContextMenuLabel>
          <SectionPart b={b} s={s} onSectionPicture={onSectionPicture} />
        </>
      )}
    </ContextMenuContent>
  );
}

/** The section's actions, grouped as a design tool groups them: its picture, the clipboard, what goes around it, how it looks, where it sits, and whether it shows. */
function SectionPart({ b, s, onSectionPicture }: { b: BuilderApi; s: Section; onSectionPicture: SectionMenuProps["onSectionPicture"] }) {
  const page = b.state.selection.page;
  const list = b.state.pages.get(page) ?? [];
  const at = list.findIndex((x) => x.id === s.id);
  const set = (patch: Record<string, unknown>) => b.apply({ kind: "page", page, op: { op: "update", id: s.id, set: patch } });
  const moveTo = (after: string | null) => b.apply({ kind: "page", page, op: { op: "move", id: s.id, after } });
  const insert = (t: Template, after: string | null) => b.insert(starter(t, b.state.rules, b.view.brand.name, b.state.nav.map((p) => p.slug), s.tab), after);
  const before = at > 0 ? list[at - 1].id : null;
  const variant = variantOf(s.template);
  const pages = b.state.nav.filter((p) => p.slug !== page);
  const picture = pictureFields(s.template).find((f) => f.name === "image");

  return (
    <>
      {picture && !b.state.lang && (
        <>
          <ContextMenuItem onSelect={() => onSectionPicture(picture.name)}>
            <IconPhoto /> {typeof s.props[picture.name] === "string" ? "Change picture…" : "Add a picture…"}
          </ContextMenuItem>
          {typeof s.props[picture.name] === "string" && (
            <ContextMenuItem onSelect={() => set({ props: withProp(s.props, picture, undefined) })}>
              <IconPhotoOff /> Remove picture
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
        </>
      )}

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

      <TemplatesSub label="Insert above" icon={<IconRowInsertTop />} onPick={(t) => insert(t, before)} />
      <TemplatesSub label="Insert below" icon={<IconRowInsertBottom />} onPick={(t) => insert(t, s.id)} />
      <ContextMenuSeparator />

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Thumbnail template={s.template} className="text-muted-foreground h-4 w-5" /> Template
          <span className="text-muted-foreground ms-auto truncate text-xs">{TEMPLATE_INFO[s.template].name}</span>
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
      <ContextMenuItem
        onSelect={() => {
          b.select({ section: s.id, rule: null });
          b.setItem(null);
          b.setDock("section");
        }}
      >
        <IconAdjustmentsHorizontal /> All settings…
      </ContextMenuItem>
      <ContextMenuSeparator />

      <ContextMenuItem disabled={at <= 0} onSelect={() => b.nudge(s.id, -1)}>
        <IconArrowUp /> Move up <ContextMenuShortcut>⌥↑</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={at < 0 || at >= list.length - 1} onSelect={() => b.nudge(s.id, 1)}>
        <IconArrowDown /> Move down <ContextMenuShortcut>⌥↓</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <IconArrowsSort /> Move to…
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="app-tokens max-h-80 font-sans">
          <ContextMenuItem disabled={at <= 0} onSelect={() => moveTo(null)}>
            <IconArrowBarToUp /> The top of the page
          </ContextMenuItem>
          <ContextMenuItem disabled={at < 0 || at >= list.length - 1} onSelect={() => moveTo(list.at(-1)!.id)}>
            <IconArrowBarToDown /> The bottom of the page
          </ContextMenuItem>
          {pages.length > 0 && (
            <>
              <ContextMenuSeparator />
              <ContextMenuLabel>Another page</ContextMenuLabel>
              {pages.map((p) => (
                <ContextMenuItem key={p.slug} onSelect={() => void b.moveToPage(s.id, p.slug)}>
                  <IconFileArrowRight /> {p.title}
                </ContextMenuItem>
              ))}
            </>
          )}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />

      <ContextMenuItem onSelect={() => set({ hidden: !s.hidden })}>
        {s.hidden ? <IconEye /> : <IconEyeOff />} {s.hidden ? "Show to readers" : "Hide from readers"}
      </ContextMenuItem>
      <ContextMenuItem variant="destructive" onSelect={() => b.removeSection(s.id)}>
        <IconTrash /> Delete section <ContextMenuShortcut>⌫</ContextMenuShortcut>
      </ContextMenuItem>
    </>
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

/** An item's actions, most reached for first: its picture, its settings, the copy and the move, adding beside it, away with it. */
function ItemPart({ b, s, i, onPictures }: { b: BuilderApi; s: Section; i: number; onPictures: SectionMenuProps["onPictures"] }) {
  const page = b.state.selection.page;
  const set = (patch: Record<string, unknown>) => b.apply({ kind: "page", page, op: { op: "update", id: s.id, set: patch } });
  const items = s.items ?? [];
  const it = items[i];
  const blank = blankItem(s, b.state.rules, b.state.nav.map((p) => p.slug));
  const translating = !!b.state.lang;
  const add = (at: number) => {
    if (!blank) return;
    if (blank.kind === "asset") onPictures(at, false);
    else set(insertItems(s, at, [blank.item]));
  };
  const name = it?.title || (it?.asset && b.view.media[it.asset]?.title) || `Item ${i + 1}`;
  return (
    <>
      <ContextMenuLabel className="truncate">{name}</ContextMenuLabel>
      {!translating && (PICTURED.has(s.template) || it?.asset) && (
        <ContextMenuItem onSelect={() => onPictures(i, true)}>
          <IconPhoto /> {it?.asset ? "Change picture…" : "Add a picture…"}
        </ContextMenuItem>
      )}
      <ContextMenuItem
        onSelect={() => {
          b.setItem({ section: s.id, i });
          b.setDock("section");
        }}
      >
        <IconAdjustmentsHorizontal /> Item settings…
      </ContextMenuItem>
      {!translating && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => set(duplicateItem(s, i))}>
            <IconCopy /> Duplicate <ContextMenuShortcut>⌘D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem disabled={i === 0} onSelect={() => set(moveItem(s, i, i - 1))}>
            <IconArrowUp /> Move earlier <ContextMenuShortcut>⌥↑</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem disabled={i >= items.length - 1} onSelect={() => set(moveItem(s, i, i + 1))}>
            <IconArrowDown /> Move later <ContextMenuShortcut>⌥↓</ContextMenuShortcut>
          </ContextMenuItem>
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
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => {
              set(removeItem(s, i));
              b.setItem(null);
            }}
          >
            <IconTrash /> Remove item <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </>
      )}
    </>
  );
}
