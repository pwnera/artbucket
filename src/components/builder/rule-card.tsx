"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconAdjustmentsHorizontal, IconAlignLeft, IconChevronRight, IconColorPicker, IconHash, IconList, IconPhotoPlus, IconTrash, IconTypography } from "@tabler/icons-react";
import { AssetPicker, AssetThumb } from "@/components/builder/asset-picker";
import { FloatingPanel } from "@/components/builder/floating-panel";
import { SpecForm } from "@/components/builder/spec-form";
import type { BuilderApi } from "@/components/builder/use-builder";
import { Editable, ReadOnly, ValueEditor } from "@/components/brand-values";
import { CopyButton } from "@/components/copy-button";
import { ImportFamily } from "@/components/font-preview";
import { usePref } from "@/components/sidebar-prefs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { contrast, grade, hexOf, inkOn } from "@/lib/color";
import { contextLabel, fontValue, resolve, RULE_SPEC, ruleLabel, ruleName, type Rule } from "@/lib/rules";
import type { ViewRule } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * A rule's card (build spec 3.5.4, W6.4): a FloatingPanel opened beside the
 * swatch, face, logo or number clicked on the canvas, which stays open while
 * the page is worked on, drags anywhere and folds to its header; another
 * specimen clicked shows its rule in the same card. It holds ValueEditor
 * (editable), label and usage, assets (AssetPicker), SpecForm, "Shown on"
 * (b.shownOn), and the key in Details only. It edits the version for
 * b.state.context: a rule shown there from the default says so, and offers
 * to make the context its own version, since an edit to the default changes
 * it for every context. Every change is b.apply of a `rules` op with the
 * whole version; a label edit never changes the key.
 *
 * A text rule's words are edited where they read, so clicking into its
 * specimen shows a chip instead: its name, its key, Details (this card) and
 * Remove from section. The card ends with the same way out of the section.
 * A color opens its quick picker first (QuickColor): hex, system picker,
 * eyedropper and contrast, with More for this card.
 *
 * Props:
 * - b: the builder.
 * - ruleKey: the rule's key.
 * - anchor: the element clicked: the card opens beside it, the chip points at it.
 * - onClose: its X, Esc, or the rule removed (the chip: also a click away).
 */
export type RuleCardProps = {
  b: BuilderApi;
  ruleKey: string;
  anchor: HTMLElement;
  onClose(): void;
};

// ValueEditor tells a key's versions apart by id, which a view's rules don't carry.
const asRule = (r: ViewRule): Rule => ({ ...r, id: `${r.key}@${r.context ?? ""}` });


export function RuleCard({ b, ruleKey: key, anchor, onClose }: RuleCardProps) {
  const context = b.state.context;
  const rule = useMemo(() => resolve(b.state.rules.filter((r) => r.key === key), context ?? "")[0], [b.state.rules, key, context]);
  const anchorRef = useMemo(() => ({ current: anchor }), [anchor]);
  const content = useRef<HTMLDivElement>(null);
  const [picking, setPicking] = useState(false);
  // The anchor whose chip asked for the whole card.
  const [opened, setOpened] = useState<HTMLElement | null>(null);

  // The card takes the focus as it opens or shows another rule, so Esc closes it; the chip leaves the caret where it is.
  // A color clicked opens the quick picker first; Details (setOpened) opens the whole card for it.
  const quick = !!rule && rule.type === "color" && opened !== anchor;
  const whole = !!rule && !quick && !(rule.type === "text" && opened !== anchor && !(anchor.matches("img") || anchor.querySelector("img")));
  useEffect(() => {
    if (whole) content.current?.focus({ preventScroll: true });
  }, [whole, key]);

  // Gone (an undo, the rules sheet): nothing left to show.
  useEffect(() => {
    if (!rule) onClose();
  }, [rule, onClose]);
  if (!rule) return null;

  const chip = !whole && !quick;
  const set = (patch: Partial<ViewRule>) => b.apply({ kind: "rules", set: [{ ...rule, ...patch }], remove: [] });

  // The section around the specimen, when it binds the rule by key: the chip can take it out.
  const page = b.state.selection.page;
  const host = anchor.closest("section[data-template]")?.id;
  const section = (b.state.pages.get(page) ?? []).find((s) => (host ? host.endsWith(s.id) : s.id === b.state.selection.section) && s.keys.includes(key));

  const removeFromSection = section
    ? () => {
        b.apply({ kind: "page", page, op: { op: "update", id: section.id, set: { keys: section.keys.filter((k) => k !== key) } } });
        onClose();
      }
    : undefined;

  if (quick)
    return (
      <Popover open onOpenChange={(open) => !open && onClose()}>
        <PopoverAnchor virtualRef={anchorRef} />
        {/* Beside the specimen, which is often tall: above or below it would cover the bar or run off the page. */}
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={{ top: 64, bottom: 16, left: 16, right: 16 }}
          aria-label={ruleName(rule)}
          className="app-tokens w-72 p-3"
          onInteractOutside={(e) => {
            if (anchor.contains(e.target as Node)) e.preventDefault();
          }}
        >
          <QuickColor
            rule={rule}
            surface={b.view.theme.surface ?? "#ffffff"}
            ink={b.view.theme.ink}
            onSet={(value) => set({ value })}
            onMore={() => setOpened(anchor)}
            onRemove={removeFromSection}
          />
        </PopoverContent>
      </Popover>
    );

  if (chip)
    return (
      <Popover open onOpenChange={(open) => !open && onClose()}>
        <PopoverAnchor virtualRef={anchorRef} />
        <PopoverContent
          side="top"
          align="start"
          collisionPadding={16}
          aria-label={ruleName(rule)}
          className="app-tokens flex w-auto max-w-[calc(100vw-2rem)] items-center gap-2 p-1.5 ps-3"
          // The chip leaves the caret in the text it sits over.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (anchor.contains(e.target as Node)) e.preventDefault();
          }}
        >
          <>
            <span className="truncate text-sm font-medium">{ruleName(rule)}</span>
            <code className="text-muted-foreground truncate font-mono text-xs">{rule.key}</code>
            <Button variant="ghost" size="xs" onClick={() => setOpened(anchor)}>
              Details
            </Button>
            {section && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  b.apply({ kind: "page", page, op: { op: "update", id: section.id, set: { keys: section.keys.filter((k) => k !== key) } } });
                  onClose();
                }}
              >
                Remove from section
              </Button>
            )}
          </>
        </PopoverContent>
      </Popover>
    );

  // The whole card floats: it stays open while the page is worked on, moves where it is dragged, and folds to its header.
  return (
    <FloatingPanel
      id="rule-card"
      anchor={anchor}
      label={ruleName(rule)}
      icon={<TypeIcon rule={rule} />}
      // The name is edited first thing in the card; the header says what it is, and its key.
      title={
        <>
          {TYPE_LABEL[rule.type]} <span className="text-muted-foreground ms-1 font-mono text-xs font-normal">{rule.key}</span>
        </>
      }
      onClose={() => {
        // A field still being typed in commits before the card goes.
        const field = document.activeElement;
        if (field instanceof HTMLElement && content.current?.contains(field)) field.blur();
        onClose();
      }}
    >
      <div ref={content} tabIndex={-1} className="grid gap-4 p-4 outline-none">
        {/* Opened from a page read-only elsewhere, the card still edits. */}
        <ReadOnly.Provider value={false}>
          <div className="grid gap-1">
            <Editable
              value={rule.label ?? ""}
              placeholder={ruleLabel(key)}
              label="Name"
              className="text-base font-semibold"
              onSave={(label) => set({ label: label || null })}
            />
            {context && (
              <p className="text-muted-foreground text-xs">
                {rule.context ? (
                  <>The {contextLabel(context)} version.</>
                ) : (
                  <>
                    From the default, which every context shares: a change here changes it everywhere.{" "}
                    <Button variant="link" size="xs" className="h-auto p-0 text-xs" onClick={() => set({ context })}>
                      Make a {contextLabel(context)} version
                    </Button>
                  </>
                )}
              </p>
            )}
          </div>
          {rule.type === "text" ? (
            // Markdown as typed: the rich editor's menus float outside the card, and a click on them would close it.
            <Editable
              multiline
              value={rule.value as string}
              label="The rule"
              placeholder="Write the rule"
              className="text-sm"
              onSave={(value) => (value ? set({ value }) : false)}
            />
          ) : (
            <ValueEditor rule={asRule(rule)} onSave={(value) => set({ value })} />
          )}
          <Part title="Usage">
            <Editable
              multiline
              value={rule.usage ?? ""}
              label="Usage"
              placeholder="When and how to use it, in Markdown"
              className="text-muted-foreground text-sm"
              onSave={(usage) => set({ usage: usage || null })}
            />
          </Part>
          <Part title={rule.type === "font" ? "Files" : "Assets"} hint={rule.assets.length ? String(rule.assets.length) : undefined}>
            <div className="flex flex-wrap items-center gap-2">
              {rule.assets.map((a) => (
                <div key={a.id} title={a.title ?? a.filename} className="bg-checker relative size-14 overflow-hidden rounded-md border">
                  <AssetThumb asset={a} />
                </div>
              ))}
              <Button variant="outline" size="xs" onClick={() => setPicking(true)}>
                <IconPhotoPlus /> {rule.assets.length ? "Change" : "Pick"}
              </Button>
            </div>
            {rule.type === "font" && rule.assets.length === 0 && (
              <ImportFamily
                family={fontValue(rule.value).family}
                onImported={(family, files) =>
                  set({
                    value: { ...fontValue(rule.value), family },
                    assets: files.map((f) => ({ ...f, rendition: null, title: null, preview: false, supersededBy: null })),
                  })
                }
              />
            )}
          </Part>
          {rule.type in RULE_SPEC && (
            <Part title="Spec">
              <SpecForm type={rule.type} spec={rule.spec} rules={b.state.rules} onChange={(spec) => set({ spec })} />
            </Part>
          )}
          <Part title="Shown on" hint={String(b.shownOn(key).length)}>
            <ShownOn b={b} ruleKey={key} onGo={onClose} />
          </Part>
          <Part title="Details">
            <div className="text-xs">
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Key</dt>
                <dd className="flex min-w-0 items-center gap-1 font-mono">
                  <span className="truncate">{rule.key}</span>
                  <CopyButton text={rule.key} label="Copy the key" what="Key" />
                </dd>
                <dt className="text-muted-foreground">Type</dt>
                <dd>{rule.type}</dd>
                <dt className="text-muted-foreground">Context</dt>
                <dd>{rule.context ? contextLabel(rule.context) : "Default"}</dd>
              </dl>
              <p className="text-muted-foreground mt-2">Agents and the API find it by its key. Renaming it changes only the heading readers see.</p>
            </div>
          </Part>
          {section && (
            <Button
              variant="outline"
              size="sm"
              className="hover:text-destructive justify-self-start"
              onClick={() => {
                b.apply({ kind: "page", page, op: { op: "update", id: section.id, set: { keys: section.keys.filter((k) => k !== key) } } });
                onClose();
              }}
            >
              <IconTrash /> Remove from this section
            </Button>
          )}
          <AssetPicker open={picking} rule={rule} transport={b.transport} onClose={() => setPicking(false)} onSave={(assets) => set({ assets })} />
        </ReadOnly.Provider>
      </div>
    </FloatingPanel>
  );
}

const TYPE_LABEL: Record<ViewRule["type"], string> = { color: "Color", text: "Text", number: "Number", list: "List", font: "Font" };

/** The rule's kind at a glance, in the card's header: a color as its swatch. */
function TypeIcon({ rule }: { rule: ViewRule }) {
  if (rule.type === "color") return <span aria-hidden className="size-4 rounded-full border" style={{ background: String(rule.value) }} />;
  const I = { text: IconAlignLeft, number: IconHash, list: IconList, font: IconTypography }[rule.type];
  return <I aria-hidden />;
}

/**
 * A color's quick picker, as a design tool's is: its swatch, its hex to type
 * or paste, the system picker and the eyedropper where the browser has one,
 * how text reads on it and it on the page, then More for the whole card.
 * A hex commits on Enter or on leaving the field; the system picker a
 * moment after its last change, never on every drag step, so the history
 * keeps one step.
 */
function QuickColor({
  rule,
  surface,
  ink,
  onSet,
  onMore,
  onRemove,
}: {
  rule: ViewRule;
  surface: string;
  ink: string;
  onSet(hex: string): void;
  onMore(): void;
  onRemove?: () => void;
}) {
  const value = hexOf(String(rule.value)) ?? "#000000";
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  // A new value from outside (undo, another tab): the field shows it.
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const shown = hexOf(draft) ?? value;
  const commit = (typed: string) => {
    const hex = hexOf(typed);
    if (!hex) return setDraft(value);
    setDraft(hex);
    if (hex !== value) onSet(hex);
  };
  // The system picker commits a moment after its last change, and before the popover goes, whichever comes first.
  const pending = useRef<{ hex: string; t: ReturnType<typeof setTimeout> } | null>(null);
  const flush = useRef(() => {});
  useEffect(() => {
    flush.current = () => {
      const p = pending.current;
      if (!p) return;
      clearTimeout(p.t);
      pending.current = null;
      commit(p.hex);
    };
  });
  useEffect(() => () => flush.current(), []);
  const picked = (hex: string) => {
    setDraft(hex);
    if (pending.current) clearTimeout(pending.current.t);
    pending.current = { hex, t: setTimeout(() => flush.current(), 300) };
  };
  const dropper = typeof window !== "undefined" && "EyeDropper" in window;
  const pairs = [
    { label: "Text on it", fg: inkOn(shown), bg: shown },
    { label: "It on the page", fg: shown, bg: surface },
    { label: "Page text on it", fg: ink, bg: shown },
  ];
  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium">{ruleName(rule)}</span>
        <code className="text-muted-foreground truncate font-mono text-xs">{rule.key}</code>
      </div>
      <div className="flex items-center gap-2">
        <label className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-md border" style={{ background: shown }} title="Pick a color">
          <input
            type="color"
            value={shown.slice(0, 7)}
            aria-label="Pick a color"
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            onChange={(e) => picked(e.target.value)}
          />
        </label>
        <Input
          value={draft}
          aria-label="Hex"
          spellCheck={false}
          className="h-9 font-mono"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(e.currentTarget.value);
            else if (e.key === "Escape" && draft !== value) {
              e.preventDefault();
              setDraft(value);
            }
          }}
        />
        {dropper && (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Pick a color from the screen"
            title="Pick a color from the screen"
            onClick={async () => {
              try {
                const got = await new (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper().open();
                commit(got.sRGBHex);
              } catch {
                // Called off with Esc.
              }
            }}
          >
            <IconColorPicker />
          </Button>
        )}
      </div>
      <ul className="grid gap-1">
        {pairs.map((x) => {
          const ratio = contrast(x.fg, x.bg);
          const g = grade(ratio);
          return (
            <li key={x.label} className="flex items-center gap-2 text-xs">
              <span className="flex h-5 w-7 shrink-0 items-center justify-center rounded border text-[10px] font-semibold" style={{ background: x.bg, color: x.fg }}>
                Aa
              </span>
              <span className="text-muted-foreground flex-1">{x.label}</span>
              <span className="tabular-nums">{ratio.toFixed(1)}</span>
              <span className={cn("w-14 rounded px-1 text-center text-[10px] font-semibold", g === "fail" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>
                {g === "fail" ? "FAIL" : g}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-1 border-t pt-2">
        <Button type="button" variant="ghost" size="xs" onClick={onMore}>
          <IconAdjustmentsHorizontal /> More…
        </Button>
        {onRemove && (
          <Button type="button" variant="ghost" size="xs" className="hover:text-destructive ms-auto" onClick={onRemove}>
            <IconTrash /> Remove from section
          </Button>
        )}
      </div>
    </div>
  );
}

/** The card's parts folded away, by title: kept in this browser, the same for every rule, as a design tool's inspector keeps its sections. */
const FOLDED = "artbucket:rule-card-folded";
const FOLDED_AT_FIRST = ["Spec", "Shown on", "Details"];

/** A part of the card, folded or open with a click on its title; `hint` says what a folded one holds. */
function Part({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const [folded, setFolded] = usePref<string[]>(FOLDED, FOLDED_AT_FIRST);
  const open = !folded.includes(title);
  return (
    <section className="grid gap-1.5">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setFolded(open ? [...folded, title] : folded.filter((t) => t !== title))}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex w-full items-center gap-1 rounded-sm text-xs font-medium outline-none focus-visible:ring-2"
        >
          <IconChevronRight aria-hidden className={cn("size-3 transition-transform", open && "rotate-90")} />
          {title}
          {!open && hint && <span className="ms-auto font-normal tabular-nums">{hint}</span>}
        </button>
      </h3>
      {open && children}
    </section>
  );
}

/** The pages that show the rule, each a way there. */
function ShownOn({ b, ruleKey, onGo }: { b: BuilderApi; ruleKey: string; onGo(): void }) {
  const slugs = b.shownOn(ruleKey);
  if (!slugs.length) return <p className="text-muted-foreground text-xs">No page shows it yet.</p>;
  return (
    <ul className="flex flex-wrap gap-1">
      {slugs.map((slug) => {
        const here = slug === b.state.selection.page;
        return (
          <li key={slug}>
            <Button
              variant="secondary"
              size="xs"
              disabled={here}
              aria-current={here ? "page" : undefined}
              onClick={() => {
                b.open(slug);
                onGo();
              }}
            >
              {b.state.nav.find((p) => p.slug === slug)?.title ?? slug}
              {here && " (this page)"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
