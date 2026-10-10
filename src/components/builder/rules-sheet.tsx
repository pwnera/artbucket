"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconAlignLeft, IconChevronDown, IconHash, IconList, IconListDetails, IconPhoto, IconPlus, IconSearch, IconX } from "@/components/icons";
import { AssetPicker } from "@/components/builder/asset-picker";
import { SpecForm } from "@/components/builder/spec-form";
import type { BuilderApi } from "@/components/builder/use-builder";
import { fieldIn, onceDrawn, RuleView, type Dnd, type Ed } from "@/components/brand-sections/rule-view";
import { copy, Editable } from "@/components/brand-values";
import { IconButton } from "@/components/icon-button";
import { InfoTip } from "@/components/info-tip";
import { Thumb } from "@/components/thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { RuleRef } from "@/lib/builder-ops";
import { keyFor, PRESETS, type Preset } from "@/lib/presets";
import { assetUrl } from "@/lib/asset-url";
import { contextLabel, fontValue, RULE_SPEC, ruleLabel, ruleName, section, type Rule } from "@/lib/rules";
import type { ViewRule } from "@/lib/site";
import { undoable } from "@/lib/undo";
import { flash } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Every rule, the list view (build spec 3.5.6, D24, W6.6): grouped by key
 * section, editable in place with RuleView and ValueEditor, SpecForm and
 * AssetPicker; add from PRESETS, delete with undo, context versions. Each
 * change is b.apply of a `rules` op. b.state.selection.rule, when set, is
 * scrolled to and opened (a #rule-{key} deep link to a rule no page shows).
 *
 * Props:
 * - b: the builder.
 * - open, onOpenChange: a controlled sheet; the builder opens it for
 *   b.panel "rules".
 */
export type RulesSheetProps = {
  b: BuilderApi;
  open: boolean;
  onOpenChange(open: boolean): void;
};

/** The sections most brands have; any other key prefix reads as its words. */
const TITLES: Record<string, string> = { color: "Color", logo: "Logo", type: "Typography", tone: "Voice and tone", imagery: "Imagery" };
const titleOf = (s: string) => TITLES[s] ?? ruleLabel(`_.${s}`);

/** A menu's presets, under a title or none. */
type Group = [string | null, Preset[]];
const ANY = PRESETS.filter((p) => !p.section);
const EVERY = [...new Set(PRESETS.map((p) => p.section).filter(Boolean))].map((s): Group => [titleOf(s), PRESETS.filter((p) => p.section === s)]);
/**
 * What each missing essential of the launch checklist adds, in one click: the
 * keys the setup screen and brand_status name (color.primary, type.heading,
 * logo.primary, tone.voice), so the theme reads each part from them.
 */
const preset = (id: string) => PRESETS.find((p) => p.id === id)!;
const ESSENTIALS = {
  colors: { label: "The main color", preset: preset("color"), name: "Primary" },
  type: { label: "A heading face", preset: preset("type-face"), name: "Heading" },
  logo: { label: "The logo", preset: preset("logo-file"), name: "Primary" },
  voice: { label: "The voice", preset: preset("tone-voice"), name: "Voice" },
};

/** A section's own presets, then the kinds that go anywhere. */
function groupsFor(s: string): Group[] {
  const own = PRESETS.filter((p) => p.section === s);
  return own.length ? [[null, own], ["Any kind", ANY]] : [[null, ANY]];
}

/** RuleView tells a key's versions apart by id, which a view's rules don't carry: the same id slots.tsx gives them. */
const idOf = (r: RuleRef) => `${r.key}@${r.context ?? ""}`;
const refOf = ({ key, context }: RuleRef): RuleRef => ({ key, context });
const same = (a: RuleRef, b: RuleRef) => a.key === b.key && a.context === b.context;

/** "Dark background" as a context: dark-background. */
const slug = (v: string) =>
  v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** A key's row in the sheet, and the block RuleView draws in it. */
const rowIn = (root: HTMLElement | null, key: string) => root?.querySelector<HTMLElement>(`[data-rule="${key}"]`) ?? null;
const blockIn = (root: HTMLElement | null, key: string) => rowIn(root, key)?.querySelector<HTMLElement>("[data-block]") ?? null;

// The rules op keeps each rule where it is, so a block here has nowhere to be dropped.
const NO_DRAG: Dnd = { onDragStart() {}, onDragEnd() {}, onDragOver() {}, onDrop() {} };

export function RulesSheet({ b, open, onOpenChange }: RulesSheetProps) {
  const rules = b.state.rules;
  // The list, found by id when it is needed: a ref read from a handler that render hands on reads as read in render.
  const bodyId = useId();
  const root = () => document.getElementById(bodyId);
  // The key whose row is open, to edit; and the version open in its Details.
  const [expanded, setExpanded] = useState<string | null>(null);
  // The rule made on this visit: it arrives, and its row lights up, rather than just appearing.
  const [made, setMade] = useState<string | null>(null);
  const [details, setDetails] = useState<RuleRef | null>(null);
  // What the list is narrowed to: words, and one section.
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<string | null>(null);
  // The section whose add menu is open: from its button, a rule's + or / on a rule.
  const [adding, setAdding] = useState<string | null>(null);
  // A preset waiting for its name, which makes its key, in the section it goes to.
  const [naming, setNaming] = useState<{ preset: Preset; section: string } | null>(null);
  // Whose assets are being picked; kept while the picker fades out.
  const [picking, setPicking] = useState<{ ref: RuleRef; open: boolean } | null>(null);
  // For a toast's Undo, which outlives this render.
  const latest = useRef(rules);
  useEffect(() => {
    latest.current = rules;
  });

  const taken = new Set(rules.map((r) => r.key));
  /** The keys of each section, sections and keys in the brand's order. */
  const sections = new Map<string, string[]>();
  for (const r of rules) {
    const ks = sections.get(section(r.key)) ?? [];
    if (!ks.includes(r.key)) sections.set(section(r.key), [...ks, r.key]);
  }
  /** A key's versions, the default first. */
  const versionsOf = (key: string) => {
    const vs = rules.filter((r) => r.key === key);
    return [...vs.filter((r) => r.context === null), ...vs.filter((r) => r.context !== null)];
  };
  const find = (ref: RuleRef) => rules.find((r) => same(r, ref));
  const change = (set: ViewRule[], remove: RuleRef[] = []) => b.apply({ kind: "rules", set, remove });
  const patch = (ref: RuleRef, fields: Partial<ViewRule>) => {
    const r = find(ref);
    return r ? change([{ ...r, ...fields }]) : null;
  };
  const reveal = (key: string, where: "block" | "value") =>
    onceDrawn(
      () => (where === "block" ? blockIn(root(), key) : fieldIn(blockIn(root(), key), "value")),
      (el) => {
        el.scrollIntoView({ block: "nearest" });
        el.focus();
      },
    );

  // A #rule-{key} deep link, or a rule picked elsewhere: open in Details as the sheet opens, and scrolled to.
  const target = open ? b.state.selection.rule : null;
  const [seen, setSeen] = useState<string | null>(null);
  if (target !== seen) {
    setSeen(target);
    const first = target ? versionsOf(target)[0] : undefined;
    if (first) {
      setDetails(refOf(first));
      setExpanded(first.key);
      setQ("");
      setOnly(null);
    }
  }
  useEffect(() => {
    if (!target) return;
    onceDrawn(
      () => blockIn(document.getElementById(bodyId), target),
      (el) => {
        el.scrollIntoView({ block: "center" });
        el.focus({ preventScroll: true });
      },
    );
  }, [target, bodyId]);

  /** A heading for every version of a key: its label, never its key, which pages, agents and tokens know it by. */
  function rename(key: string, name: string) {
    const label = name && name !== ruleLabel(key) ? name : null;
    const vs = versionsOf(key).filter((r) => r.label !== label);
    if (vs.length) change(vs.map((r) => ({ ...r, label })));
  }

  /** A preset into its own section, else `at`. One with a fixed name that exists already is shown instead. */
  function pick(p: Preset, at: string) {
    const home = p.section || at;
    const fixed = p.name && keyFor(home, p.name, new Set());
    setQ("");
    setOnly(null);
    if (fixed && taken.has(fixed)) {
      setExpanded(fixed);
      return reveal(fixed, "block");
    }
    if (p.name) make(p, home, p.name);
    else setNaming({ preset: p, section: home });
  }

  /** The preset made, named `name`; then the caret in its value, or the picker for a rule that is mostly its files. */
  function make(p: Preset, home: string, name: string) {
    const key = keyFor(home, name, taken);
    if (!key) return false;
    const r: ViewRule = {
      key,
      context: null,
      type: p.type,
      // What was typed, when the key can't say it ("CMYK blue" is color.cmykBlue).
      label: name === ruleLabel(key) ? null : name,
      value: p.value,
      usage: p.usage ?? null,
      spec: null,
      assets: [],
    };
    if (!change([r])) return false;
    setMade(key);
    flash(`[data-rule="${CSS.escape(key)}"]`);
    setExpanded(key);
    setDetails(refOf(r));
    if (p.assets) setPicking({ ref: refOf(r), open: true });
    else reveal(key, "value");
    return true;
  }

  /** Gone at once, with the 8 s Undo (Cmd+Z undoes it too). A page that shows it shows it missing meanwhile. */
  async function remove(x: Rule) {
    const r = find(x);
    if (!r) return false;
    const rest = versionsOf(r.key).filter((v) => v !== r);
    // The key's last version: its block leaves with RuleView's animation, and RuleView moves focus on.
    const el = rest.length ? null : blockIn(root(), r.key);
    if (el) {
      el.setAttribute("data-leaving", "");
      await new Promise((ok) => setTimeout(ok, 150));
    }
    if (!change([], [refOf(r)])) {
      el?.removeAttribute("data-leaving");
      return false;
    }
    setDetails((d) => (d && same(d, r) ? (rest[0] ? refOf(rest[0]) : null) : d));
    if (!rest.length) setExpanded((k) => (k === r.key ? null : k));
    const shown = rest.length ? 0 : b.shownOn(r.key).length;
    undoable(`Deleted ${ruleName(r)}${r.context ? ` for ${contextLabel(r.context)}` : ""}`, {
      description: shown ? `${shown === 1 ? "A page shows" : `${shown} pages show`} it as missing until it is back.` : undefined,
      // Cmd+Z may have brought it back already.
      undo: () => (latest.current.some((v) => same(v, r)) ? false : (change([r]) ?? Promise.reject())),
    });
    return true;
  }

  /** Every version again as "<name> copy", at its section's end. */
  function duplicate(key: string) {
    const vs = versionsOf(key);
    const to = keyFor(section(key), `${ruleName(vs[0])} copy`, taken);
    if (to && change(vs.map((r) => ({ ...r, key: to, label: r.label && `${r.label} copy` })))) {
      setMade(to);
      flash(`[data-rule="${CSS.escape(to)}"]`);
      setExpanded(to);
      reveal(to, "block");
    }
  }

  /** A version of `from` for a context, to change from there; one that exists is opened instead. */
  function addVersion(from: ViewRule, raw: string) {
    const context = slug(raw);
    if (context && (find({ key: from.key, context }) || change([{ ...from, context }]))) setDetails({ key: from.key, context });
  }

  const edFor = (key: string): Ed => ({
    taken,
    resets: 0,
    fresh: false,
    canMove: [false, false],
    dnd: NO_DRAG,
    onPatch: (r, { value = r.value, usage = r.usage }) => void patch(r, { value, usage }),
    onRename: (_, name) => rename(key, name),
    onNamed: () => {},
    onDelete: remove,
    onDetails: (id, kb) => {
      const r = rules.find((x) => idOf(x) === id);
      if (!r) return;
      setDetails(refOf(r));
      if (kb) onceDrawn(() => rowIn(root(), key)?.querySelector<HTMLElement>("[data-details] textarea"), (f) => f.focus());
    },
    onInsert: () => setAdding(section(key)),
    onDuplicate: () => duplicate(key),
    onMove: () => {},
    onCopyLink: () => void copy(`${location.origin}${location.pathname}${location.search}#rule-${key}`, "the link"),
  });

  const draft = (at: string) =>
    naming?.section === at && (
      <NameDraft
        key={naming.preset.id}
        preset={naming.preset}
        at={at}
        taken={taken}
        onCommit={(name) => make(naming.preset, at, name)}
        onDone={() => setNaming(null)}
      />
    );
  const picked = picking ? find(picking.ref) : undefined;

  /** The sections and keys the search and the section chip leave. */
  const needle = q.trim().toLowerCase();
  const matches = (key: string) =>
    !needle ||
    versionsOf(key).some((r) => [r.key, ruleName(r), typeof r.value === "string" ? r.value : JSON.stringify(r.value)].some((t) => t.toLowerCase().includes(needle)));
  const shownSections = [...sections]
    .filter(([name]) => only === null || name === only)
    .map(([name, keys]): [string, string[]] => [name, keys.filter(matches)])
    .filter(([, keys]) => keys.length > 0);
  /** The essentials the launch checklist still wants (b.status), each a preset a click away. */
  const missing = (b.status?.steps ?? [])
    .filter((st) => st.done === false && st.id in ESSENTIALS)
    .map((st) => ({ id: st.id, ...ESSENTIALS[st.id as keyof typeof ESSENTIALS] }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="app-tokens flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
        // Esc in a field puts the field back; only outside one does it close the sheet.
        onEscapeKeyDown={(e) => {
          const el = document.activeElement;
          if (!(el instanceof HTMLElement) || !el.matches("input, textarea, [contenteditable=true]")) return;
          e.preventDefault();
          // The sheet hears Esc before the rich editor can: leaving the editor saves it.
          if (el.isContentEditable) el.blur();
        }}
      >
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <IconListDetails className="size-5" /> Rules
          </SheetTitle>
          <SheetDescription>Colors, type, logo and words, as data.</SheetDescription>
        </SheetHeader>

        <div className="grid gap-3 border-b px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <IconSearch aria-hidden className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a rule by name or value" aria-label="Find a rule" className="h-8 ps-8" />
            </div>
            <AddMenu label="Add a rule" groups={EVERY} onPick={(p) => pick(p, p.section)} variant="default" />
          </div>
          {sections.size > 1 && (
            <div role="group" aria-label="Show one section" className="flex flex-wrap gap-1.5">
              {[null, ...sections.keys()].map((name) => (
                <button
                  key={name ?? "*"}
                  type="button"
                  aria-pressed={only === name}
                  onClick={() => setOnly(name)}
                  className="text-muted-foreground hover:bg-accent aria-pressed:bg-foreground aria-pressed:text-background focus-visible:ring-ring/50 rounded-full border px-2.5 py-0.5 text-xs outline-none focus-visible:ring-2"
                >
                  {name === null ? "All" : titleOf(name)} <span className="tabular-nums opacity-70">{name === null ? taken.size : sections.get(name)!.length}</span>
                </button>
              ))}
            </div>
          )}
          {missing.length > 0 && (
            <div className="bg-muted/60 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm">
              <span className="text-muted-foreground">Still missing:</span>
              {missing.map((m) => (
                <Button
                  key={m.id}
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setQ("");
                    setOnly(null);
                    make(m.preset, m.preset.section, m.name);
                  }}
                >
                  <IconPlus /> {m.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div id={bodyId} className="min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-5">
          {!rules.length && <p className="text-muted-foreground text-sm">No rules yet. Start with a color, a typeface and the logo.</p>}
          {rules.length > 0 && !shownSections.length && <p className="text-muted-foreground text-sm">No rule by that name or value.</p>}
          {shownSections.map(([name, keys]) => (
            <section key={name} aria-labelledby={`rules-${name}`} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 id={`rules-${name}`} className="text-sm font-semibold">
                  {titleOf(name)}
                </h3>
                <span className="text-muted-foreground text-xs tabular-nums">{keys.length}</span>
                <AddMenu
                  label="Add"
                  groups={groupsFor(name)}
                  open={adding === name}
                  onOpenChange={(o) => setAdding(o ? name : null)}
                  onPick={(p) => pick(p, name)}
                  className="ms-auto"
                />
              </div>
              <ul className="divide-y rounded-lg border">
                {keys.map((key) => {
                  const vs = versionsOf(key);
                  const open = expanded === key;
                  const shown = (details?.key === key ? find(details) : undefined) ?? vs[0];
                  return (
                    <li key={key} data-rule={key}>
                      <RuleRow
                        rule={vs[0]}
                        versions={vs.length}
                        pages={b.shownOn(key).length}
                        open={open}
                        onToggle={() => {
                          setExpanded(open ? null : key);
                          setDetails(open ? null : refOf(vs[0]));
                        }}
                      />
                      {open && (
                        // Start padding: room for RuleView's gutter, its + and handle.
                        <div className="bg-muted/20 animate-in fade-in-0 slide-in-from-top-1 border-t py-4 ps-12 pe-4 duration-150">
                          <RuleView rules={vs.map((r) => ({ ...r, id: idOf(r) }))} entering={key === made} selected={idOf(shown)} line={null} dragging={false} ed={edFor(key)} />
                          <Details
                            rule={shown}
                            b={b}
                            onHeading={(name) => rename(key, name)}
                            onVersion={(c) => addVersion(shown, c)}
                            onPatch={(fields) => patch(shown, fields)}
                            onAssets={() => setPicking({ ref: refOf(shown), open: true })}
                            onPage={(page) => {
                              b.open(page);
                              onOpenChange(false);
                            }}
                            onClose={() => {
                              setExpanded(null);
                              setDetails(null);
                            }}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {draft(name)}
            </section>
          ))}
          {naming && !sections.has(naming.section) && draft(naming.section)}
        </div>

        <datalist id="rule-contexts">
          {b.view.contexts.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {/* Inside the sheet, so a click in the picker isn't a click outside it. */}
        {picking && picked && (
          <AssetPicker
            open={picking.open}
            rule={picked}
            onClose={() => setPicking((p) => p && { ...p, open: false })}
            onSave={(assets) => patch(picked, { assets })}
            transport={b.transport}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/** A preset's menu: each with what it is for. Focus stays where a pick sends it, not on the button. */
function AddMenu({
  label,
  groups,
  open,
  onOpenChange,
  onPick,
  className,
  variant = "ghost",
}: {
  label: string;
  variant?: "ghost" | "default";
  groups: Group[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onPick: (p: Preset) => void;
  className?: string;
}) {
  const picked = useRef(false);
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm" className={cn(variant === "ghost" && "text-muted-foreground", className)}>
          <IconPlus /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-96 w-72"
        onCloseAutoFocus={(e) => {
          if (picked.current) e.preventDefault();
          picked.current = false;
        }}
      >
        {groups.map(([title, presets], i) => (
          <DropdownMenuGroup key={title ?? i}>
            {i > 0 && <DropdownMenuSeparator />}
            {title && <DropdownMenuLabel>{title}</DropdownMenuLabel>}
            {presets.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onSelect={() => {
                  picked.current = true;
                  onPick(p);
                }}
              >
                <span className="grid">
                  <span>{p.label}</span>
                  <span className="text-muted-foreground text-xs">{p.hint}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A preset that asks for its name first, since the name makes its key. Enter adds it (the suggestion when left empty), Esc leaves. */
function NameDraft({
  preset: p,
  at,
  taken,
  onCommit,
  onDone,
}: {
  preset: Preset;
  at: string;
  taken: Set<string>;
  onCommit: (name: string) => boolean;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const name = text.trim() || p.suggest || p.label;
  const key = keyFor(at, name, taken);
  return (
    <form
      className="grid gap-1 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (key && onCommit(name)) onDone();
      }}
    >
      <Input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={p.suggest ?? p.label}
        aria-label={`Name the new ${p.label.toLowerCase()}`}
        onKeyDown={(e) => e.key === "Escape" && onDone()}
        onBlur={() => !text.trim() && onDone()}
      />
      <p className="text-muted-foreground text-xs" aria-live="polite">
        {key ? (
          <>
            Key <code className="font-mono">{key}</code>
          </>
        ) : (
          "A name needs a letter in it."
        )}
      </p>
    </form>
  );
}

/** A rule's value in a line: what a row says under its name. */
function summaryOf(r: ViewRule): string {
  const v = r.value;
  switch (r.type) {
    case "color":
      return String(v).toUpperCase() + (r.usage ? `, ${r.usage}` : "");
    case "font": {
      const f = fontValue(v);
      return [f.family, f.weight].filter(Boolean).join(" ");
    }
    case "number":
      return `${v}${(r.spec as { unit?: string } | null)?.unit ?? ""}${r.usage ? `, ${r.usage}` : ""}`;
    case "list":
      return (v as (string | number)[]).join(" · ");
    default:
      // Markdown to its words, in a line.
      return String(v)
        .replace(/[*_`#>[\]()]/g, "")
        .replace(/\s+/g, " ")
        .trim();
  }
}

/** A rule's thumbnail: its color, its face, its picture, or what kind it is. */
function RulePreview({ r }: { r: ViewRule }) {
  const box = "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border";
  if (r.type === "color") return <span aria-hidden className={box} style={{ background: String(r.value) }} />;
  if (r.type === "font")
    return (
      <span aria-hidden className={cn(box, "bg-background text-base")} style={{ fontFamily: `"${fontValue(r.value).family}", var(--font-sans)` }}>
        Aa
      </span>
    );
  const pic = r.assets.find((a) => a.preview);
  if (pic)
    return (
      <span aria-hidden className={cn(box, "bg-checker")}>
        <Thumb src={assetUrl(pic.id, "/w_80,f_webp")} alt="" />
      </span>
    );
  const I = r.type === "list" ? IconList : r.type === "number" ? IconHash : IconAlignLeft;
  return (
    <span aria-hidden className={cn(box, "bg-muted text-muted-foreground")}>
      <I className="size-4" />
    </span>
  );
}

/** One rule in the list, closed: its preview, name, value, versions and where it shows; a click opens it to edit. */
function RuleRow({ rule: r, versions, pages, open, onToggle }: { rule: ViewRule; versions: number; pages: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      title={r.key}
      className="hover:bg-muted/50 focus-visible:ring-ring/50 flex w-full items-center gap-3 px-3 py-2 text-start outline-none focus-visible:ring-3 focus-visible:ring-inset"
    >
      <RulePreview r={r} />
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-sm font-medium">{ruleName(r)}</span>
        <span className="text-muted-foreground truncate text-xs">{summaryOf(r)}</span>
      </span>
      {versions > 1 && (
        <Badge variant="outline" className="shrink-0">
          {versions} versions
        </Badge>
      )}
      <span className={cn("hidden shrink-0 text-xs sm:inline", pages ? "text-muted-foreground" : "text-warning")}>
        {pages ? `On ${pages} ${pages === 1 ? "page" : "pages"}` : "On no page"}
      </span>
      <IconChevronDown aria-hidden className={cn("text-muted-foreground size-4 shrink-0 transition-transform", open && "rotate-180")} />
    </button>
  );
}

/** What the page can't show of a version: its heading and key, context versions, spec, assets, and the pages showing it. */
function Details({
  rule: r,
  b,
  onHeading,
  onVersion,
  onPatch,
  onAssets,
  onPage,
  onClose,
}: {
  rule: ViewRule;
  b: BuilderApi;
  onHeading: (name: string) => void;
  onVersion: (context: string) => void;
  onPatch: (fields: Partial<ViewRule>) => void;
  onAssets: () => void;
  onPage: (slug: string) => void;
  onClose: () => void;
}) {
  const pages = b.shownOn(r.key).flatMap((s) => b.state.nav.filter((p) => p.slug === s));
  return (
    <div data-details className="bg-muted/40 mb-4 grid gap-4 rounded-lg border p-4 text-sm">
      <div className="flex items-center gap-2">
        <p className="font-medium">{r.context ? `Only in ${contextLabel(r.context)}` : "Details"}</p>
        <IconButton variant="ghost" size="icon-xs" label="Close details" className="ms-auto" onClick={onClose}>
          <IconX className="size-4" />
        </IconButton>
      </div>
      <Part
        label="Heading"
        info={
          <>
            What readers see, for every version. The key, <code className="font-mono">{r.key}</code>, stays: pages, agents and design tokens know the rule by it.
          </>
        }
      >
        <Editable value={r.label ?? ""} placeholder={ruleLabel(r.key)} label="Heading" onSave={onHeading} />
      </Part>
      <Part label="Versions" info="A copy of this one, used only in one context: print, a dark background, a channel.">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = e.currentTarget;
            onVersion(String(new FormData(f).get("context") ?? ""));
            f.reset();
          }}
        >
          <Input name="context" list="rule-contexts" placeholder="print, dark-background" aria-label="Context of a new version" className="h-8" />
          <Button type="submit" variant="outline" size="sm">
            <IconPlus /> Add a version
          </Button>
        </form>
      </Part>
      {r.type in RULE_SPEC && (
        <Part label="Spec">
          <SpecForm type={r.type} spec={r.spec} rules={b.state.rules} onChange={(spec) => onPatch({ spec })} />
        </Part>
      )}
      <Part label="Assets">
        <Button variant="outline" size="sm" className="justify-self-start" onClick={onAssets}>
          <IconPhoto /> {r.assets.length ? `${r.assets.length} picked: change` : "Pick from the library"}
        </Button>
      </Part>
      <Part label="Shown on">
        {pages.length ? (
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {pages.map((p) => (
              <li key={p.slug}>
                <Button variant="link" size="xs" className="h-auto px-0" onClick={() => onPage(p.slug)}>
                  {p.title}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No page yet.</p>
        )}
      </Part>
    </div>
  );
}

function Part({ label, info, children }: { label: string; info?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </p>
      {children}
    </div>
  );
}
