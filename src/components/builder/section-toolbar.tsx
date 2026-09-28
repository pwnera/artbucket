"use client";

import { useState } from "react";
import {
  IconAdjustmentsHorizontal,
  IconArrowAutofitWidth,
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconClipboard,
  IconColumns,
  IconCopy,
  IconDots,
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconLink,
  IconPhoto,
  IconPlus,
  IconTexture,
  IconTrash,
  IconViewportNarrow,
  IconViewportWide,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { AssetPicker } from "@/components/builder/asset-picker";
import { Thumbnail } from "@/components/builder/thumbnails";
import type { BuilderApi } from "@/components/builder/use-builder";
import { useEdit, useSite } from "@/components/site/site-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sectionGround } from "@/lib/brand-theme";
import { apply } from "@/lib/builder-ops";
import { AUDIENCES, type Section, TEMPLATE_INFO, TEMPLATES, type Template, type Tone } from "@/lib/pages";
import { camel, keyFor, PRESETS } from "@/lib/presets";
import { contextLabel, resolve, ruleName, section as keySection } from "@/lib/rules";
import type { Media, ViewAsset, ViewRule } from "@/lib/site";
import { fieldsOf, withProp } from "@/lib/template-fields";
import { cn } from "@/lib/utils";

/**
 * A section's toolbar on its top edge (build spec 3.5.2, W6.2), the few
 * things reached for most: the template switch (templates whose `accepts` fit
 * its bound rules) and its variant (layout or kind), tone swatches, bound
 * rules (a popover filtered by `accepts`, and "New rule" from PRESETS), move
 * up and down, the settings panel (section-panel.tsx: width, columns and the
 * rest), and a menu to duplicate, copy, hide and delete. Every
 * change is b.apply of a `page` op on b.state.selection.page; delete is
 * b.removeSection, duplicate b.duplicate, move b.nudge. It sits in the
 * canvas's EditContext, and draws in the app's colors (.app-tokens).
 *
 * Props:
 * - b: the builder.
 * - section: the section it sits on, as stored (not localized).
 */
export type SectionToolbarProps = {
  b: BuilderApi;
  section: Section;
};

/** Marks the toolbar's drag handle: the canvas starts a drag only from it. */
export const HANDLE = "data-drag-handle";

/** Templates whose renderers read `columns`: type takes one or two. */
export const COLUMNS: Partial<Record<Template, number>> = { cards: 4, palette: 4, type: 2, logos: 4, dodont: 4, gallery: 4, links: 4, pages: 4 };

export const WIDTHS = [
  ["text", IconViewportNarrow, "Text width"],
  ["wide", IconViewportWide, "Wide"],
  ["full", IconArrowAutofitWidth, "Full bleed"],
] as const;

export const GROUNDS: [Tone, string][] = [
  ["plain", "Plain"],
  ["tint", "Tint"],
  ["brand", "Brand"],
  ["panel", "Panel"],
  ["dark", "Dark"],
  ["pattern", "Pattern"],
];

/** A toolbar button: small, labelled, pressed when it says so. */
function Tool({ label, pressed, className, ...p }: React.ComponentProps<typeof Button> & { label: string; pressed?: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn("size-7 aria-pressed:bg-accent aria-pressed:text-accent-foreground", className)}
      {...p}
    />
  );
}

/** Columns on a wide screen, one click each: 1 to the most its template draws. */
export function ColumnsPicker({ s, set, className }: Pick<Part, "s" | "set"> & { className?: string }) {
  const most = COLUMNS[s.template];
  if (!most) return null;
  return (
    <span role="radiogroup" aria-label="Columns, on a wide screen" title="Columns" className={cn("flex items-center", className)}>
      <IconColumns aria-hidden className="text-muted-foreground mx-1 size-4" />
      {Array.from({ length: most }, (_, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={s.columns === i + 1}
          aria-label={`${i + 1} ${i ? "columns" : "column"}`}
          onClick={() => set({ columns: i + 1 })}
          className="hover:bg-accent aria-checked:bg-accent aria-checked:text-accent-foreground focus-visible:ring-ring/50 text-muted-foreground flex size-7 items-center justify-center rounded-md text-xs font-medium tabular-nums outline-none focus-visible:ring-2 aria-checked:font-semibold"
        >
          {i + 1}
        </button>
      ))}
    </span>
  );
}

const Sep = () => <span aria-hidden className="bg-border mx-0.5 h-5 w-px" />;

/**
 * What switching to `t` sets: the template and its props, the old
 * template's defaults following the new one's, and contexts dropped where
 * the new one binds nothing. Props are kept when they still parse.
 */
function switchTo(s: Section, t: Template, keepProps: boolean): Record<string, unknown> {
  const from = TEMPLATE_INFO[s.template];
  const to = TEMPLATE_INFO[t];
  const set: Record<string, unknown> = { template: t, props: keepProps ? s.props : {} };
  if (s.width === from.width) set.width = to.width;
  if (s.columns === from.columns) set.columns = to.columns;
  if (s.tone === from.tone && to.tone !== s.tone) Object.assign(set, { tone: to.tone, background: null });
  if (!to.accepts && s.contexts) set.contexts = null;
  return set;
}

/** Each key's default version, else its first: what `accepts` and the lists read. */
export function byKey(rules: ViewRule[]): Map<string, ViewRule> {
  const m = new Map<string, ViewRule>();
  for (const r of rules) if (!m.has(r.key) || r.context === null) m.set(r.key, r);
  return m;
}

/** A picked asset as a view's media, so the canvas draws it before the page is loaded again. */
export const asMedia = (a: ViewAsset, url: (id: string, rest?: string) => string): Media => ({
  id: a.id,
  filename: a.filename,
  title: a.title,
  description: null,
  creator: null,
  copyright: null,
  mime: a.mime,
  size: a.size,
  width: a.width ?? null,
  height: a.height ?? null,
  thumbnail: a.preview ? url(a.id, "/w_640,f_webp") : null,
  preview: a.preview ? url(a.id, "/w_1600,f_webp") : null,
  original: url(a.id),
  downloads: [],
  focus: null,
  updatedAt: "",
});

/** The asset picker picks a rule's assets; a picture for a ground or the theme's pattern goes through a stand-in rule. */
export function standIn(label: string, m: Media | undefined): ViewRule {
  const assets: ViewAsset[] = m
    ? [{ id: m.id, rendition: null, title: m.title, filename: m.filename, mime: m.mime, size: m.size, width: m.width, height: m.height, preview: !!m.preview, supersededBy: null }]
    : [];
  return { key: "section.picture", context: null, type: "text", label, value: "", usage: null, spec: null, assets };
}

export function SectionToolbar({ b, section: s }: SectionToolbarProps) {
  const page = b.state.selection.page;
  const info = TEMPLATE_INFO[s.template];
  const list = b.state.pages.get(page) ?? [];
  const at = list.findIndex((x) => x.id === s.id);
  const set = (patch: Record<string, unknown>) => b.apply({ kind: "page", page, op: { op: "update", id: s.id, set: patch } });

  return (
    <div
      role="group"
      aria-label={`${info.name} section`}
      className="app-tokens bg-background text-foreground flex max-w-full flex-wrap items-center gap-0.5 rounded-lg border p-0.5 font-sans text-sm leading-normal font-normal tracking-normal normal-case shadow-lg"
    >
      <span
        {...{ [HANDLE]: "" }}
        draggable
        aria-hidden
        title="Drag to move"
        className="text-muted-foreground hover:bg-accent flex size-7 cursor-grab items-center justify-center rounded-md active:cursor-grabbing"
      >
        <IconGripVertical className="size-4" />
      </span>
      <TemplateMenu b={b} s={s} set={set} />
      <VariantMenu s={s} set={set} />
      <Sep />
      <TonePicker b={b} s={s} set={set} />
      {info.accepts && <RulesPicker b={b} s={s} set={set} />}
      <Sep />
      <Tool label="Move up (Alt+Up)" disabled={at <= 0} onClick={() => b.nudge(s.id, -1)}>
        <IconArrowUp />
      </Tool>
      <Tool label="Move down (Alt+Down)" disabled={at < 0 || at >= list.length - 1} onClick={() => b.nudge(s.id, 1)}>
        <IconArrowDown />
      </Tool>
      <Sep />
      <Tool label="Section settings: width, columns, options" pressed={b.dock === "section"} onClick={() => b.setDock(b.dock === "section" ? null : "section")}>
        <IconAdjustmentsHorizontal />
      </Tool>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Tool label="More for this section">
            <IconDots />
          </Tool>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="app-tokens w-52">
          <DropdownMenuItem onSelect={() => b.duplicate(s.id)}>
            <IconCopy /> Duplicate <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => b.copy(s.id)}>
            <IconClipboard /> Copy <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => set({ hidden: !s.hidden })}>
            {s.hidden ? <IconEye /> : <IconEyeOff />} {s.hidden ? "Show to readers" : "Hide from readers"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => b.removeSection(s.id)}>
            <IconTrash /> Delete <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export type Part = { b: BuilderApi; s: Section; set: (patch: Record<string, unknown>) => unknown };

/**
 * The templates the section's rules fit, each checked as the server would
 * apply it: `set` is the patch that switches to it, `why` says why one
 * can't take the section's items. The current one has neither.
 */
export function templateOptions(b: BuilderApi, s: Section): { t: Template; set: Record<string, unknown> | null; why: string | null }[] {
  const page = b.state.selection.page;
  const rules = byKey(b.state.rules);
  const fits = (t: Template) => {
    const accepts = TEMPLATE_INFO[t].accepts;
    return !s.keys.length || (!!accepts && s.keys.every((k) => !rules.has(k) || accepts(rules.get(k)!)));
  };
  return TEMPLATES.filter(fits).map((t) => {
    if (t === s.template) return { t, set: null, why: null };
    let why = "";
    for (const keep of [true, false]) {
      const patch = switchTo(s, t, keep);
      const r = apply(b.state, { kind: "page", page, op: { op: "update", id: s.id, set: patch } });
      if (!r.errors.length) return { t, set: patch, why: null };
      why = r.errors[0].replace(/^[^:]*: /, "");
    }
    return { t, set: null, why };
  });
}

/** The template switch: its thumbnail and name, opening the templates it could be. */
export function TemplateMenu({ b, s, set, className }: Part & { className?: string }) {
  const [open, setOpen] = useState(false);
  const options = open ? templateOptions(b, s) : [];
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="xs" className={cn("h-7 gap-1.5", className)} title="Switch template">
          <Thumbnail template={s.template} className="text-muted-foreground h-4 w-6" />
          {TEMPLATE_INFO[s.template].name}
          <IconChevronDown aria-hidden className="ms-auto opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="app-tokens max-h-[min(28rem,60vh)] w-72 overflow-y-auto">
        <DropdownMenuLabel>{s.keys.length ? "Templates its rules fit" : "Template"}</DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuItem key={o.t} disabled={!!o.why} onSelect={() => o.set && set(o.set)} className="items-start">
            <Thumbnail template={o.t} className="bg-muted mt-0.5 h-6 w-9 shrink-0 rounded-sm p-0.5" />
            <span className="grid min-w-0 flex-1">
              <span>{TEMPLATE_INFO[o.t].name}</span>
              {o.why && <span className="text-muted-foreground text-xs">{o.why}</span>}
            </span>
            {o.t === s.template && <IconCheck aria-label="Current" className="mt-0.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A template's variant prop: `layout`, else `kind`, the one choice that changes how it reads the most. */
export function variantOf(t: Template) {
  const fields = fieldsOf(t);
  const f = fields.find((x) => x.name === "layout") ?? fields.find((x) => x.name === "kind");
  return f?.kind === "choice" ? f : null;
}

/** "bento" to "Bento", "clearspace" to "Clear space". */
export const choiceLabel = (v: string) => CHOICE_LABELS[v] ?? v.charAt(0).toUpperCase() + v.slice(1);
const CHOICE_LABELS: Record<string, string> = { clearspace: "Clear space", minsize: "Minimum size", cobrand: "Co-brand", dodont: "Do and don't" };

/** The variant as a quick switch beside the template: Cards, List, Stats... */
function VariantMenu({ s, set }: Pick<Part, "s" | "set">) {
  const f = variantOf(s.template);
  if (!f) return null;
  const value = (s.props[f.name] as string | undefined) ?? f.fallback;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="xs" className="h-7" title={f.label}>
          {choiceLabel(value)}
          <IconChevronDown aria-hidden className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="app-tokens">
        <DropdownMenuLabel>{f.label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => set({ props: withProp(s.props, f, v) })}>
          {f.options.map((o) => (
            <DropdownMenuRadioItem key={o} value={o}>
              {choiceLabel(o)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A ground to pick, drawn as it would read. */
function Swatch({ on, label, bg, onClick, children }: { on: boolean; label: string; bg: string; onClick(): void; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={onClick}
      style={{ background: bg }}
      className="focus-visible:ring-ring/50 aria-pressed:ring-primary text-muted-foreground flex size-8 items-center justify-center rounded-full border outline-none focus-visible:ring-3 aria-pressed:ring-2 aria-pressed:ring-offset-2"
    >
      {children}
    </button>
  );
}

/** The ground: the theme's tones, the palette's colors, a picture, the theme's pattern. */
export function TonePicker({ b, s, set }: Part) {
  const { view, context, url } = useSite();
  const [picking, setPicking] = useState<"image" | "pattern" | null>(null);
  const colorOf = (key: string) => resolve(view.rules.filter((r) => r.key === key), context ?? "")[0];
  const paint = (tone: Tone, background?: Section["background"]) =>
    sectionGround(view.theme, { tone, background }, colorOf).background ?? view.theme.surface ?? "var(--background)";
  const colors = [...byKey(view.rules).values()].filter((r) => r.type === "color" && typeof r.value === "string");
  const image = s.background?.image ? view.media[s.background.image] : undefined;
  const device = view.theme.device;
  const current = s.tone === "image" ? "#000" : paint(s.tone, s.background);

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon-xs" className="size-7" aria-label={`Ground: ${s.tone}`} title="Ground">
            <span className="size-4 rounded-full border" style={{ background: current }} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="grid w-72 gap-3 p-3">
          <p className="text-sm font-medium">Ground</p>
          <div className="flex flex-wrap gap-2">
            {GROUNDS.map(([tone, label]) => (
              <Swatch key={tone} on={s.tone === tone} label={label} bg={paint(tone)} onClick={() => set({ tone, background: null })}>
                {tone === "pattern" && <IconTexture className="size-4" />}
              </Swatch>
            ))}
            <Swatch
              on={s.tone === "image"}
              label="Picture"
              bg={image?.thumbnail ? `center / cover url(${JSON.stringify(image.thumbnail)})` : "var(--muted)"}
              onClick={() => (s.background?.image ? set({ tone: "image", background: { image: s.background.image } }) : setPicking("image"))}
            >
              {!image?.thumbnail && <IconPhoto className="size-4" />}
            </Swatch>
          </div>
          {colors.length > 0 && (
            <>
              <p className="text-muted-foreground text-xs">Palette</p>
              <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto p-1">
                {colors.map((r) => (
                  <Swatch
                    key={r.key}
                    on={s.tone === "color" && s.background?.color === r.key}
                    label={ruleName(r)}
                    bg={paint("color", { color: r.key })}
                    onClick={() => set({ tone: "color", background: { color: r.key } })}
                  />
                ))}
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="xs" onClick={() => setPicking("image")}>
              <IconPhoto aria-hidden /> {s.background?.image ? "Change picture" : "Pick a picture"}
            </Button>
            <Button type="button" variant="outline" size="xs" onClick={() => setPicking("pattern")}>
              <IconTexture aria-hidden /> {device ? "Change pattern" : "Pick a pattern"}
            </Button>
          </div>
          {s.tone === "pattern" && !device && <p className="text-muted-foreground text-xs">The pattern is the theme&apos;s: pick an SVG for every page.</p>}
        </PopoverContent>
      </Popover>
      <AssetPicker
        open={picking !== null}
        rule={standIn(picking === "pattern" ? "Pattern" : "Picture", picking === "pattern" ? (device ? view.media[device] : undefined) : image)}
        onClose={() => setPicking(null)}
        onSave={(assets) => {
          const a = assets.at(-1);
          const was = picking;
          setPicking(null);
          if (!a) return;
          b.addMedia([asMedia(a, url)]);
          if (was === "pattern") {
            if (b.apply({ kind: "theme", set: { device: a.id } })) set({ tone: "pattern", background: null });
          } else set({ tone: "image", background: { image: a.id } });
        }}
      />
    </>
  );
}

/** The rules the section shows, in order: remove one, add one its template takes, or make one from a preset. */
export function RulesPicker({ b, s, set }: Part) {
  const edit = useEdit();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const accepts = TEMPLATE_INFO[s.template].accepts!;
  const rules = byKey(b.state.rules);
  const bound = new Set(s.keys);
  const needle = q.trim().toLowerCase();
  const found = (r: ViewRule) => !needle || r.key.toLowerCase().includes(needle) || ruleName(r).toLowerCase().includes(needle);
  const addable = [...rules.values()].filter((r) => !bound.has(r.key) && accepts(r) && found(r));
  // A preset fits as the rule it makes would: one that is mostly its files fits where pictures go.
  const presets = PRESETS.filter((p) => accepts({ key: "x.y", type: p.type, value: p.value, assets: p.assets ? [{ id: "", rendition: null }] : [] }));

  const openCard = (key: string) => {
    setOpen(false);
    if (trigger) edit?.openRule(key, trigger);
  };
  const make = (p: (typeof PRESETS)[number]) => {
    const home = p.section || (s.keys[0] ? keySection(s.keys[0]) : camel(b.state.selection.page) || "brand");
    const key = keyFor(home, p.name ?? p.suggest ?? p.label, new Set(rules.keys()));
    if (!key) return toast.error(`Couldn't name a rule for ${p.label}`);
    const rule: ViewRule = { key, context: null, type: p.type, label: null, value: p.value, usage: p.usage ?? null, spec: null, assets: [] };
    if (!b.apply({ kind: "rules", set: [rule], remove: [] })) return;
    set({ keys: [...s.keys, key] });
    // Its card, to write its value (and pick its files).
    openCard(key);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button ref={setTrigger} type="button" variant="ghost" size="xs" className="h-7" title="Rules shown here">
          <IconLink aria-hidden />
          {s.keys.length} {s.keys.length === 1 ? "rule" : "rules"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-80 gap-3 p-3">
        <p className="text-sm font-medium">Rules shown here</p>
        {s.keys.length > 0 ? (
          <ol className="grid max-h-48 gap-0.5 overflow-y-auto">
            {s.keys.map((k) => {
              const r = rules.get(k);
              return (
                <li key={k} className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!r}
                    onClick={() => openCard(k)}
                    className="hover:bg-accent focus-visible:ring-ring/50 min-w-0 flex-1 truncate rounded px-1.5 py-1 text-start text-sm outline-none focus-visible:ring-2"
                  >
                    {r ? ruleName(r) : k}
                    {!r && <span className="text-destructive ms-1 text-xs">no such rule</span>}
                  </button>
                  <Tool label={`Stop showing ${r ? ruleName(r) : k}`} onClick={() => set({ keys: s.keys.filter((x) => x !== k) })}>
                    <IconX />
                  </Tool>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-muted-foreground text-sm">None yet: {TEMPLATE_INFO[s.template].binds}.</p>
        )}
        <div className="grid gap-1.5">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a rule to add" aria-label="Find a rule to add" className="h-8" />
          <ul className="grid max-h-40 gap-0.5 overflow-y-auto">
            {addable.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => set({ keys: [...s.keys, r.key] })}
                  className="hover:bg-accent focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded px-1.5 py-1 text-start text-sm outline-none focus-visible:ring-2"
                >
                  <IconPlus aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="truncate">{ruleName(r)}</span>
                  <span className="text-muted-foreground ms-auto shrink-0 text-xs">{r.type}</span>
                </button>
              </li>
            ))}
            {!addable.length && <li className="text-muted-foreground px-1.5 py-1 text-sm">{needle ? "No rule by that name" : "Every rule it takes is here"}</li>}
          </ul>
        </div>
        {presets.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="justify-self-start">
                <IconPlus aria-hidden /> New rule
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[min(24rem,60vh)] w-64 overflow-y-auto">
              {presets.map((p) => (
                <DropdownMenuItem key={p.id} onSelect={() => make(p)} className="grid gap-0">
                  <span>{p.label}</span>
                  <span className="text-muted-foreground text-xs">{p.hint}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Where it shows: the page tab it sits under, a tab per context, and who may read it on a portal. */
export function Visibility({ b, s, set }: Part) {
  const { view } = useSite();
  const tabs = [...new Set((b.state.pages.get(b.state.selection.page) ?? []).flatMap((x) => x.tab ?? []))];
  const contexts = ["default", ...view.contexts];
  const picked = s.contexts ?? [];
  const toggle = (c: string, on: boolean) => {
    const next = contexts.filter((x) => (x === c ? on : picked.includes(x)));
    set({ contexts: next.length >= 2 ? next : null });
  };
  const id = `more-${s.id}`;

  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-tab`}>Tab</Label>
        <Input
          // A new value from elsewhere (undo) shows: the input starts again from it.
          key={s.tab ?? ""}
          id={`${id}-tab`}
          list={`${id}-tabs`}
          defaultValue={s.tab ?? ""}
          placeholder="None: on the page itself"
          className="h-8"
          maxLength={40}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v !== (s.tab ?? "")) set({ tab: v || null });
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <datalist id={`${id}-tabs`}>
          {tabs.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <p className="text-muted-foreground text-xs">Sections with the same tab show under one tab.</p>
      </div>
      {TEMPLATE_INFO[s.template].accepts && view.contexts.length > 0 && (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">A tab per context</legend>
          {contexts.map((c) => (
            <Label key={c} className="font-normal">
              <Checkbox checked={picked.includes(c)} onCheckedChange={(v) => toggle(c, v === true)} />
              {contextLabel(c)}
            </Label>
          ))}
          <p className="text-muted-foreground text-xs">Pick two or more: each shows the rules as that context has them.</p>
        </fieldset>
      )}
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Who reads it on a portal</legend>
        {AUDIENCES.map((a) => (
          <Label key={a} className="font-normal">
            <input
              type="radio"
              name={`${id}-audience`}
              checked={(s.audience ?? "everyone") === a}
              onChange={() => set({ audience: a === "everyone" ? null : a })}
              className="accent-primary size-4"
            />
            {a === "everyone" ? "Everyone let in" : a === "partners" ? "Partners and members" : "Members only"}
          </Label>
        ))}
      </fieldset>
    </>
  );
}
