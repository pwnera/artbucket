"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { IconGripVertical, IconPhoto, IconPlus, IconX } from "@tabler/icons-react";
import { asMedia } from "@/components/brand-sections/slots";
import { endDrag, startDrag } from "@/components/builder/drag";
import { ITEM_FIELDS } from "@/components/builder/items";
import {
  byKey,
  choiceLabel,
  COLUMNS,
  ColumnsPicker,
  RulesPicker,
  TemplateMenu,
  TonePicker,
  Visibility,
  WIDTHS,
} from "@/components/builder/section-toolbar";
import { starter } from "@/components/builder/seam";
import { Thumbnail } from "@/components/builder/thumbnails";
import { Thumb } from "@/components/thumb";
import type { BuilderApi } from "@/components/builder/use-builder";
import { useSite } from "@/components/site/site-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apply } from "@/lib/builder-ops";
import { COLLECTION_ICONS } from "@/lib/collection-icons";
import { type Item, type Section, TEMPLATE_INFO, TEMPLATES } from "@/lib/pages";
import { ruleName } from "@/lib/rules";
import { type Field, fieldsOf, withProp } from "@/lib/template-fields";
import { cn } from "@/lib/utils";

/**
 * The panel docked beside the canvas (b.dock), which never covers the page,
 * so a change shows as it is made. "Section" sets the picked section up:
 * its template, width, columns and ground, the options its template takes
 * (every prop in TEMPLATE_PROPS, through lib/template-fields.ts), the
 * rules it shows, the item a right click asked for, and where it shows.
 * "Add" holds the blocks and the rules, to drag onto the canvas or click in.
 * Every change is b.apply of a `page` op, tried first so a refusal shows by
 * its field instead of in a toast. The canvas draws it inside its
 * SiteProvider and EditContext, which the ground and rules pickers read.
 *
 * Props:
 * - b: the builder.
 */
export type SectionPanelProps = {
  b: BuilderApi;
};

const LibraryPicker = lazy(() => import("@/components/asset-picker").then((m) => ({ default: m.LibraryPicker })));

export function SectionPanel({ b }: SectionPanelProps) {
  const tab = b.dock ?? "section";
  return (
    <aside
      aria-label={tab === "section" ? "Section settings" : "Add to the page"}
      className="app-tokens bg-background text-foreground sticky top-12 flex h-[calc(100dvh-3rem)] w-80 shrink-0 flex-col border-s font-sans"
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={tab}
          onValueChange={(v) => v && b.setDock(v as "section" | "insert")}
          aria-label="Panel"
        >
          <ToggleGroupItem value="section">Section</ToggleGroupItem>
          <ToggleGroupItem value="insert">Add</ToggleGroupItem>
        </ToggleGroup>
        <Button variant="ghost" size="icon-sm" className="ms-auto" aria-label="Close the panel" title="Close" onClick={() => b.setDock(null)}>
          <IconX />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{tab === "section" ? <Settings b={b} /> : <Insert b={b} />}</div>
    </aside>
  );
}

// ---- the section's settings ------------------------------------------------

/** A group of settings under a heading. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-b px-3 py-4 last:border-b-0">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** A labelled row: the control under its name, help under it, an error under that. */
function Row({ label, htmlFor, about, error, children }: { label: string; htmlFor?: string; about?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {about && <p className="text-muted-foreground text-xs">{about}</p>}
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

function Settings({ b }: { b: BuilderApi }) {
  const page = b.state.selection.page;
  const id = b.state.selection.section;
  const s = id ? b.state.pages.get(page)?.find((x) => x.id === id) : undefined;
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  if (!s)
    return (
      <p className="text-muted-foreground px-4 py-10 text-center text-sm">
        Pick a section on the page to set it up. Right-click one for everything it can do.
      </p>
    );

  /** Tried first: a refusal shows under `field`, and nothing changes. */
  const set = (patch: Record<string, unknown>, field = "") => {
    const op = { kind: "page" as const, page, op: { op: "update" as const, id: s.id, set: patch } };
    const r = apply(b.state, op);
    if (r.errors.length) return setError({ field, message: r.errors[0].replace(/^[^:]*: /, "") });
    setError(null);
    b.apply(op);
  };
  const errorOf = (field: string) => (error?.field === field ? error.message : null);
  const info = TEMPLATE_INFO[s.template];
  const fields = fieldsOf(s.template);
  const item = b.item?.section === s.id && s.items?.[b.item.i] ? b.item.i : null;

  return (
    <>
      <Group title="Layout">
        <Row label="Template" about={info.use}>
          <TemplateMenu b={b} s={s} set={set} className="bg-muted/50 h-8 w-full justify-start border" />
        </Row>
        <Row label="Width">
          <ToggleGroup type="single" variant="outline" size="sm" value={s.width} onValueChange={(v) => v && set({ width: v })} aria-label="Width">
            {WIDTHS.map(([w, I, label]) => (
              <ToggleGroupItem key={w} value={w} aria-label={label} title={label}>
                <I />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Row>
        {COLUMNS[s.template] && (
          <Row label="Columns" about="On a wide screen; fewer on a narrow one.">
            <ColumnsPicker s={s} set={set} className="-ms-1" />
          </Row>
        )}
        <Row label="Ground">
          <span className="flex items-center gap-2">
            <TonePicker b={b} s={s} set={set} />
            <span className="text-muted-foreground text-sm">{choiceLabel(s.tone)}</span>
          </span>
        </Row>
      </Group>

      {fields.length > 0 && (
        <Group title="Options">
          {fields.map((f) => (
            <PropField key={f.name} b={b} s={s} f={f} error={errorOf(f.name)} onSet={(props) => set({ props }, f.name)} />
          ))}
        </Group>
      )}

      {info.accepts && (
        <Group title="Rules">
          <p className="text-muted-foreground text-sm">
            {s.keys.length
              ? s.keys.map((k) => b.state.rules.find((r) => r.key === k)).flatMap((r) => (r ? ruleName(r) : [])).join(", ")
              : `None yet: ${info.binds}.`}
          </p>
          <span className="justify-self-start rounded-md border">
            <RulesPicker b={b} s={s} set={set} />
          </span>
          <p className="text-muted-foreground text-xs">Or drag one in from Add.</p>
        </Group>
      )}

      {item !== null && <ItemSettings key={`${s.id}:${item}`} b={b} s={s} i={item} set={set} error={errorOf("item")} />}

      <Group title="Where it shows">
        <Label className="font-normal">
          <Switch checked={!s.hidden} onCheckedChange={(on) => set({ hidden: !on })} />
          Shown to readers
        </Label>
        <Visibility b={b} s={s} set={set} />
      </Group>
    </>
  );
}

/** One prop's control, by its kind. A text or number commits on leaving it, or Enter. */
function PropField({ b, s, f, error, onSet }: { b: BuilderApi; s: Section; f: Field; error: string | null; onSet(props: Record<string, unknown>): void }) {
  const id = `prop-${s.id}-${f.name}`;
  const value = s.props[f.name];
  const put = (v: unknown) => onSet(withProp(s.props, f, v));
  const row = (control: React.ReactNode) => (
    <Row label={f.label} htmlFor={id} about={f.about} error={error}>
      {control}
    </Row>
  );

  switch (f.kind) {
    case "choice":
      return row(
        f.options.length <= 4 && f.options.every((o) => o.length <= 10) ? (
          <ToggleGroup id={id} type="single" variant="outline" size="sm" value={(value as string) ?? f.fallback} onValueChange={(v) => v && put(v)} className="flex-wrap">
            {f.options.map((o) => (
              <ToggleGroupItem key={o} value={o}>
                {choiceLabel(o)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : (
          <Select value={(value as string) ?? f.fallback} onValueChange={put}>
            <SelectTrigger id={id} size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="app-tokens">
              {f.options.map((o) => (
                <SelectItem key={o} value={o}>
                  {choiceLabel(o)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      );
    case "switch":
      return (
        <div className="grid gap-1">
          <Label className="justify-between font-normal">
            {f.label}
            <Switch checked={(value as boolean | undefined) ?? f.fallback} onCheckedChange={put} />
          </Label>
          {f.about && <p className="text-muted-foreground text-xs">{f.about}</p>}
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
      );
    case "multi": {
      const on = (value as string[] | undefined) ?? [];
      return row(
        <div id={id} className="flex flex-wrap gap-x-3 gap-y-1.5">
          {f.options.map((o) => (
            <Label key={o} className="font-normal">
              <Checkbox checked={on.includes(o)} onCheckedChange={(v) => put(f.options.filter((x) => (x === o ? v === true : on.includes(x))))} />
              {o.toUpperCase().length <= 4 ? o.toUpperCase() : choiceLabel(o)}
            </Label>
          ))}
        </div>,
      );
    }
    case "number":
      return row(<Commit id={id} type="number" min={f.min} max={f.max} step={f.int ? 1 : "any"} value={value === undefined ? "" : String(value)} onCommit={(v) => put(v === "" ? undefined : Number(v))} />);
    case "numbers":
      return row(
        <Commit
          id={id}
          value={((value as number[] | undefined) ?? []).join(", ")}
          placeholder="0.5, 1, 2"
          onCommit={(v) => put(v.split(/[\s,]+/).filter(Boolean).map(Number))}
        />,
      );
    case "text":
      return row(<Commit id={id} long={f.long} maxLength={f.max} value={(value as string | undefined) ?? ""} onCommit={(v) => put(v.trim())} />);
    case "page":
      return row(
        <Select value={(value as string | undefined) ?? THIS} onValueChange={(v) => put(v === THIS ? undefined : v)}>
          <SelectTrigger id={id} size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="app-tokens">
            <SelectItem value={THIS}>This page</SelectItem>
            {b.state.nav.map((p) => (
              <SelectItem key={p.slug} value={p.slug}>
                {p.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>,
      );
    case "asset":
      return row(<PictureField b={b} id={id} value={value as string | undefined} onPick={put} video={f.name === "video"} />);
    case "collection":
    case "search":
      return row(<SavedPicker b={b} id={id} kind={f.kind} value={value as string | undefined} onPick={put} />);
    case "group":
      return <GroupField s={s} f={f} error={error} onSet={put} />;
    default:
      return row(<p className="text-muted-foreground text-xs">Set by an agent, with edit_page.</p>);
  }
}

/** A "This page" value in a page select: Radix selects can't hold an empty one. */
const THIS = "\u0000this";

/** An input that commits on leaving it or Enter, and starts again from a new value from elsewhere (undo). */
function Commit({
  value,
  onCommit,
  long,
  ...p
}: Omit<React.ComponentProps<"input">, "value" | "onChange"> & { value: string; onCommit(v: string): void; long?: boolean }) {
  const done = (v: string) => v !== value && onCommit(v);
  if (long)
    return (
      <textarea
        key={value}
        id={p.id}
        defaultValue={value}
        maxLength={p.maxLength}
        rows={4}
        onBlur={(e) => done(e.currentTarget.value)}
        className="border-input focus-visible:ring-ring/50 min-h-20 rounded-md border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:ring-3"
      />
    );
  return (
    <Input
      key={value}
      defaultValue={value}
      className="h-8"
      onBlur={(e) => done(e.currentTarget.value)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      {...p}
    />
  );
}

/** A group of numbers set together (type's scale): it is on with all of them, off with none. */
function GroupField({ s, f, error, onSet }: { s: Section; f: Extract<Field, { kind: "group" }>; error: string | null; onSet(v: unknown): void }) {
  const value = s.props[f.name] as Record<string, number> | undefined;
  // ponytail: a starting point for type's formula, the only group; read it off the schema if a second one comes.
  const START: Record<string, number> = { base: 16, ratio: 1.25, steps: 6 };
  return (
    <div className="grid gap-2">
      <Label className="justify-between font-normal">
        {f.label}
        <Switch
          checked={!!value}
          onCheckedChange={(on) => onSet(on ? Object.fromEntries(f.fields.map((x) => [x.name, START[x.name] ?? (x.kind === "number" ? (x.min ?? 1) : 1)])) : undefined)}
        />
      </Label>
      {value && (
        <div className="grid grid-cols-3 gap-2">
          {f.fields.map((x) =>
            x.kind === "number" ? (
              <label key={x.name} className="grid gap-1 text-xs">
                <span className="text-muted-foreground">{x.label}</span>
                <Commit type="number" min={x.min} max={x.max} step={x.int ? 1 : "any"} value={String(value[x.name] ?? "")} onCommit={(v) => v && onSet({ ...value, [x.name]: Number(v) })} />
              </label>
            ) : null,
          )}
        </div>
      )}
      {f.about && <p className="text-muted-foreground text-xs">{f.about}</p>}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

/** A picture from the library: its thumbnail, a way to pick another, and one to clear it. */
function PictureField({ b, id, value, onPick, video }: { b: BuilderApi; id: string; value?: string; onPick(id: string | undefined): void; video?: boolean }) {
  const { url } = useSite();
  const [picking, setPicking] = useState(false);
  const m = value ? b.view.media[value] : undefined;
  return (
    <div className="flex items-center gap-2">
      <span className="bg-muted flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border">
        {m?.thumbnail ? <Thumb src={m.thumbnail} alt="" /> : <IconPhoto className="text-muted-foreground size-5" />}
      </span>
      <Button id={id} type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
        {value ? "Change" : "Pick"}
      </Button>
      {value && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onPick(undefined)}>
          Clear
        </Button>
      )}
      {picking && (
        <Suspense>
          <LibraryPicker
            title={video ? "Pick a video" : "Pick a picture"}
            description="From the library."
            filter={video ? (a) => a.mime.startsWith("video/") : undefined}
            onClose={() => setPicking(false)}
            onPick={(a) => {
              setPicking(false);
              b.addMedia([asMedia(a, url)]);
              onPick(a.id);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

/** A collection or a saved search of the workspace, by name. */
function SavedPicker({ b, id, kind, value, onPick }: { b: BuilderApi; id: string; kind: "collection" | "search"; value?: string; onPick(id: string | undefined): void }) {
  const [list, setList] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => {
    let live = true;
    void b.transport("GET", kind === "collection" ? "/api/v1/collections" : "/api/v1/searches").then((r) => {
      if (live) setList(r.ok ? ((r.data as { id: string; name: string }[] | null) ?? []) : []);
    });
    return () => {
      live = false;
    };
  }, [b, kind]);
  const NONE = "\u0000none";
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onPick(v === NONE ? undefined : v)}>
      <SelectTrigger id={id} size="sm" className="w-full">
        <SelectValue placeholder={list ? undefined : "Loading…"} />
      </SelectTrigger>
      <SelectContent className="app-tokens">
        <SelectItem value={NONE}>None</SelectItem>
        {value && !list?.some((x) => x.id === value) && <SelectItem value={value}>{list ? "One you can't see" : "Loading…"}</SelectItem>}
        {list?.map((x) => (
          <SelectItem key={x.id} value={x.id}>
            {x.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---- an item ------------------------------------------------------------------

/** An item's own fields, beyond its words (typed on the canvas) and its picture (picked there). */
function ItemSettings({ b, s, i, set, error }: { b: BuilderApi; s: Section; i: number; set(patch: Record<string, unknown>, field?: string): void; error: string | null }) {
  const it = s.items![i];
  const fields = ITEM_FIELDS[s.template] ?? [];
  const put = (patch: Partial<Item>) => {
    const next: Record<string, unknown> = { ...it, ...patch };
    for (const k of Object.keys(patch)) if (next[k] === undefined || next[k] === "") delete next[k];
    set({ items: s.items!.map((x, k) => (k === i ? next : x)) }, "item");
  };
  const rules = [...byKey(b.state.rules).values()];
  const name = it.title || (it.asset && b.view.media[it.asset]?.title) || `Item ${i + 1}`;
  const id = (f: string) => `item-${s.id}-${i}-${f}`;

  return (
    <Group title={`Item: ${name}`}>
      {!fields.length && <p className="text-muted-foreground text-sm">Its words are typed on the page, and its picture is picked there.</p>}
      {fields.includes("verdict") && (
        <Row label="Verdict">
          <ToggleGroup type="single" variant="outline" size="sm" value={it.verdict ?? ""} onValueChange={(v) => v && put({ verdict: v as "do" | "dont" })}>
            <ToggleGroupItem value="do">Do</ToggleGroupItem>
            <ToggleGroupItem value="dont">Don&apos;t</ToggleGroupItem>
          </ToggleGroup>
        </Row>
      )}
      {fields.includes("link") &&
        (s.template === "pages" ? (
          <Row label="Page" htmlFor={id("link")}>
            <Select value={it.link?.replace(/^\//, "") ?? ""} onValueChange={(v) => put({ link: `/${v}` })}>
              <SelectTrigger id={id("link")} size="sm" className="w-full">
                <SelectValue placeholder="Pick a page" />
              </SelectTrigger>
              <SelectContent className="app-tokens">
                {b.state.nav.map((p) => (
                  <SelectItem key={p.slug} value={p.slug}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        ) : (
          <Row label="Link" htmlFor={id("link")} about="https://, mailto:, or /page for a page of the brand.">
            <Commit id={id("link")} value={it.link ?? ""} placeholder="https://" onCommit={(v) => put({ link: v.trim() || undefined })} />
          </Row>
        ))}
      {fields.includes("label") && (
        <Row label="Label" htmlFor={id("label")} about="A small tag: Figma, PDF, Partners only.">
          <Commit id={id("label")} maxLength={40} value={it.label ?? ""} onCommit={(v) => put({ label: v.trim() || undefined })} />
        </Row>
      )}
      {fields.includes("icon") && (
        <Row label="Icon" htmlFor={id("icon")}>
          <Select value={it.icon ?? NONE} onValueChange={(v) => put({ icon: v === NONE ? undefined : v })}>
            <SelectTrigger id={id("icon")} size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="app-tokens max-h-72">
              <SelectItem value={NONE}>None</SelectItem>
              {COLLECTION_ICONS.map((x) => (
                <SelectItem key={x} value={x}>
                  {choiceLabel(x)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      )}
      {fields.includes("level") && s.props.layout === "tree" && (
        <Row label="Depth">
          <ToggleGroup type="single" variant="outline" size="sm" value={String(it.level ?? 0)} onValueChange={(v) => v && put({ level: Number(v) || undefined })}>
            {["0", "1", "2"].map((l) => (
              <ToggleGroupItem key={l} value={l}>
                {Number(l) + 1}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Row>
      )}
      {fields.includes("span") && s.props.layout === "bento" && (
        <Label className="justify-between font-normal">
          Two cells wide
          <Switch checked={it.span === 2} onCheckedChange={(on) => put({ span: on ? 2 : undefined })} />
        </Label>
      )}
      {fields.includes("download") && (
        <Label className="justify-between font-normal">
          Offer it as a download
          <Switch checked={it.download !== false} onCheckedChange={(on) => put({ download: on ? undefined : false })} />
        </Label>
      )}
      {fields.includes("key") && (
        <Row label={s.template === "logos" ? "On the color" : "Points at the rule"} htmlFor={id("key")}>
          <Select value={it.key ?? NONE} onValueChange={(v) => put({ key: v === NONE ? undefined : v })}>
            <SelectTrigger id={id("key")} size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="app-tokens max-h-72">
              {s.template !== "logos" && <SelectItem value={NONE}>None</SelectItem>}
              {rules
                .filter((r) => s.template !== "logos" || r.type === "color")
                .map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {ruleName(r)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Row>
      )}
      {fields.includes("at") && (
        <Row label="Where on the picture" about="Percent from the top left of the picture.">
          <div className="grid grid-cols-2 gap-2">
            {(["x", "y"] as const).map((axis, k) => (
              <label key={axis} className="grid gap-1 text-xs">
                <span className="text-muted-foreground">{axis === "x" ? "Across" : "Down"}</span>
                <Commit
                  type="number"
                  min={0}
                  max={100}
                  value={String(it.at?.[k] ?? 50)}
                  onCommit={(v) => {
                    const at: [number, number] = [...(it.at ?? [50, 50])] as [number, number];
                    at[k] = Math.max(0, Math.min(100, Number(v) || 0));
                    put({ at });
                  }}
                />
              </label>
            ))}
          </div>
        </Row>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => b.setItem(null)}>
        Done with this item
      </Button>
    </Group>
  );
}

const NONE = "\u0000none";

// ---- add ----------------------------------------------------------------------

/**
 * Blocks and rules to put on the page: drag one onto the canvas (a block
 * between sections, a rule onto a section that takes it), or click: a block
 * goes after the picked section (else last), a rule onto the picked section.
 */
function Insert({ b }: { b: BuilderApi }) {
  const [q, setQ] = useState("");
  const page = b.state.selection.page;
  const list = b.state.pages.get(page) ?? [];
  const picked = list.find((x) => x.id === b.state.selection.section);
  const needle = q.trim().toLowerCase();
  const rules = [...byKey(b.state.rules).values()].filter((r) => !needle || r.key.toLowerCase().includes(needle) || ruleName(r).toLowerCase().includes(needle));
  const add = (t: (typeof TEMPLATES)[number]) => {
    const section = starter(t, b.state.rules, b.view.brand.name, b.state.nav.map((p) => p.slug), picked?.tab);
    b.insert(section, picked?.id ?? list.at(-1)?.id ?? null);
  };
  const takes = (key: string) => {
    const r = b.state.rules.find((x) => x.key === key);
    return !!(picked && r && !picked.keys.includes(key) && TEMPLATE_INFO[picked.template].accepts?.(r));
  };
  const bind = (key: string) => picked && b.apply({ kind: "page", page, op: { op: "update", id: picked.id, set: { keys: [...picked.keys, key] } } });

  return (
    <>
      <Group title="Blocks">
        <p className="text-muted-foreground text-xs">Drag one between sections, or click to add it {picked ? "after the picked section" : "at the end"}.</p>
        <ul className="grid grid-cols-2 gap-2">
          {TEMPLATES.map((t) => (
            <li key={t}>
              <button
                type="button"
                draggable
                onDragStart={(e) => startDrag(e, { kind: "template", template: t }, "copy")}
                onDragEnd={endDrag}
                onClick={() => add(t)}
                title={TEMPLATE_INFO[t].use}
                className="hover:border-primary hover:bg-primary/5 focus-visible:ring-ring/50 grid w-full cursor-grab gap-1 rounded-lg border p-1.5 text-start outline-none focus-visible:ring-3 active:cursor-grabbing"
              >
                <span className="bg-muted text-foreground block rounded-md p-1">
                  <Thumbnail template={t} className="block aspect-[8/5] w-full" />
                </span>
                <span className="px-0.5 text-xs font-medium">{TEMPLATE_INFO[t].name}</span>
              </button>
            </li>
          ))}
        </ul>
      </Group>
      <Group title="Rules">
        <p className="text-muted-foreground text-xs">Drag one onto a section that takes it{picked ? ", or click to add it to the picked one" : ""}.</p>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a rule" aria-label="Find a rule" className="h-8" />
        <ul className="grid gap-0.5">
          {rules.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                draggable
                onDragStart={(e) => startDrag(e, { kind: "rule", key: r.key }, "copy")}
                onDragEnd={endDrag}
                disabled={!takes(r.key)}
                onClick={() => bind(r.key)}
                className={cn(
                  "hover:bg-accent focus-visible:ring-ring/50 flex w-full cursor-grab items-center gap-2 rounded px-1.5 py-1 text-start text-sm outline-none focus-visible:ring-2 active:cursor-grabbing",
                  // Still draggable onto another section when the picked one can't take it.
                  "disabled:pointer-events-auto disabled:cursor-grab",
                )}
              >
                <IconGripVertical aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
                <span className="truncate">{ruleName(r)}</span>
                <span className="text-muted-foreground ms-auto shrink-0 text-xs">{r.type}</span>
                {takes(r.key) && <IconPlus aria-hidden className="text-muted-foreground size-3.5 shrink-0" />}
              </button>
            </li>
          ))}
          {!rules.length && <li className="text-muted-foreground px-1.5 py-1 text-sm">No rule by that name</li>}
        </ul>
      </Group>
    </>
  );
}
