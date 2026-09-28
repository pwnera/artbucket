"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconPhotoPlus } from "@tabler/icons-react";
import { AssetPicker, AssetThumb } from "@/components/builder/asset-picker";
import { SpecForm } from "@/components/builder/spec-form";
import type { BuilderApi } from "@/components/builder/use-builder";
import { Editable, ReadOnly, ValueEditor } from "@/components/brand-values";
import { CopyButton } from "@/components/copy-button";
import { ImportFamily } from "@/components/font-preview";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { contextLabel, fontValue, resolve, RULE_SPEC, ruleLabel, ruleName, type Rule } from "@/lib/rules";
import type { ViewRule } from "@/lib/site";

/**
 * A rule's card (build spec 3.5.4, W6.4): a popover anchored to the swatch,
 * face, logo or number clicked on the canvas, holding ValueEditor
 * (editable), label and usage, assets (AssetPicker), SpecForm, "Shown on"
 * (b.shownOn), and the key in Details only. It edits the version for
 * b.state.context: a rule shown there from the default says so, and offers
 * to make the context its own version, since an edit to the default changes
 * it for every context. Every change is b.apply of a `rules` op with the
 * whole version; a label edit never changes the key.
 *
 * A text rule's words are edited where they read, so clicking into its
 * specimen shows a chip instead: its name, its key, Details (this card) and
 * Remove from section.
 *
 * Props:
 * - b: the builder.
 * - ruleKey: the rule's key.
 * - anchor: the element clicked, which the popover points at.
 * - onClose: Esc, a click away, or the rule removed.
 */
export type RuleCardProps = {
  b: BuilderApi;
  ruleKey: string;
  anchor: HTMLElement;
  onClose(): void;
};

// ValueEditor tells a key's versions apart by id, which a view's rules don't carry.
const asRule = (r: ViewRule): Rule => ({ ...r, id: `${r.key}@${r.context ?? ""}` });

const FIELD = "input, textarea, select, [contenteditable=true]";

export function RuleCard({ b, ruleKey: key, anchor, onClose }: RuleCardProps) {
  const context = b.state.context;
  const rule = useMemo(() => resolve(b.state.rules.filter((r) => r.key === key), context ?? "")[0], [b.state.rules, key, context]);
  const anchorRef = useMemo(() => ({ current: anchor }), [anchor]);
  const content = useRef<HTMLDivElement>(null);
  const [picking, setPicking] = useState(false);
  // The anchor whose chip asked for the whole card.
  const [opened, setOpened] = useState<HTMLElement | null>(null);

  // Gone (an undo, the rules sheet): nothing left to show.
  useEffect(() => {
    if (!rule) onClose();
  }, [rule, onClose]);
  if (!rule) return null;

  const chip = rule.type === "text" && opened !== anchor && !(anchor.matches("img") || anchor.querySelector("img"));
  const set = (patch: Partial<ViewRule>) => b.apply({ kind: "rules", set: [{ ...rule, ...patch }], remove: [] });

  // The section around the specimen, when it binds the rule by key: the chip can take it out.
  const page = b.state.selection.page;
  const host = anchor.closest("section[data-template]")?.id;
  const section = (b.state.pages.get(page) ?? []).find((s) => (host ? host.endsWith(s.id) : s.id === b.state.selection.section) && s.keys.includes(key));

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (open) return;
        // A field still being typed in commits before the card goes.
        const field = document.activeElement;
        if (field instanceof HTMLElement && content.current?.contains(field)) field.blur();
        onClose();
      }}
    >
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        ref={content}
        side={chip ? "top" : "bottom"}
        align="start"
        collisionPadding={16}
        aria-label={ruleName(rule)}
        className={chip ? "app-tokens flex w-auto max-w-[calc(100vw-2rem)] items-center gap-2 p-1.5 ps-3" : "app-tokens grid max-h-[min(80vh,44rem)] w-96 gap-4 overflow-y-auto"}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          // The card takes focus itself, so a first Esc closes it; the chip leaves the caret in the text it sits over.
          if (!chip) content.current?.focus();
        }}
        onInteractOutside={(e) => {
          // The specimen itself, and the picker opened from here, are not away.
          if (picking || anchor.contains(e.target as Node)) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          // Esc in a field puts back what is saved first; the next one closes.
          if (!chip && document.activeElement?.matches(FIELD) && content.current?.contains(document.activeElement)) e.preventDefault();
        }}
      >
        {chip ? (
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
        ) : (
          // Opened from a page read-only elsewhere, the card still edits.
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
            <Part title={rule.type === "font" ? "Files" : "Assets"}>
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
            <Part title="Shown on">
              <ShownOn b={b} ruleKey={key} onGo={onClose} />
            </Part>
            <details className="text-xs">
              <summary className="text-muted-foreground cursor-pointer">Details</summary>
              <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
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
            </details>
            <AssetPicker open={picking} rule={rule} transport={b.transport} onClose={() => setPicking(false)} onSave={(assets) => set({ assets })} />
          </ReadOnly.Provider>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-1.5">
      <h3 className="text-muted-foreground text-xs font-medium">{title}</h3>
      {children}
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
