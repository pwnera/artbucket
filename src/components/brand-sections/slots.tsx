"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { HEAD, LABEL } from "@/components/brand-sections/look";
import { RuleView } from "@/components/brand-sections/rule-view";
import { ReadOnly, ValueEditor } from "@/components/brand-values";
import { copyText } from "@/components/copy-button";
import { useMedia, useSite } from "@/components/site/site-context";
import { renderMarkdown, SITE_PATH } from "@/lib/markdown";
import type { Section } from "@/lib/pages";
import type { Rule } from "@/lib/rules";
import { firstBinding, type ViewRule } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Where a section's own words go: its eyebrow, title, lede, body and aside,
 * its items' titles, texts and captions, and the rules it shows. Templates
 * place these and never print the strings themselves, so the builder (W6)
 * makes each one editable here, in one file, and no template branches on
 * editing. The frame (frame.tsx) says which section they read.
 */

type Scope = {
  section: Section;
  /** This copy of the section carries the page's `rule-{key}` anchors; its other context tabs don't, so ids stay unique. */
  anchors: boolean;
};

export const SectionScope = createContext<Scope | null>(null);

function useScope(): Scope {
  const scope = useContext(SectionScope);
  if (!scope) throw new Error("A slot needs a SectionFrame above it");
  return scope;
}

/** The section the slots around here read. */
export const useSection = () => useScope().section;

/** The id of a section's heading, which the frame names the section by. */
export const titleOf = (domId: string) => `${domId}-title`;

// ---- the section's words ------------------------------------------------------

export function Eyebrow({ className }: { className?: string }) {
  const { eyebrow } = useSection();
  return eyebrow ? <p className={cn(LABEL, "text-muted-foreground", className)}>{eyebrow}</p> : null;
}

/** The section's heading: an h2 under the page's h1, unless a cover opening the page makes it the h1. */
export function Title({ as: H = "h2", className }: { as?: "h1" | "h2" | "h3"; className?: string }) {
  const s = useSection();
  const { idOf } = useSite();
  if (!s.title) return null;
  return (
    <H id={titleOf(idOf(s.id))} className={cn(HEAD, "text-3xl text-balance @3xl:text-4xl", className)}>
      {s.title}
    </H>
  );
}

/** A line or two under the title, set large. Plain text. */
export function Lede({ className }: { className?: string }) {
  const { lede } = useSection();
  return lede ? <p className={cn("text-muted-foreground text-lg text-pretty @3xl:text-xl", className)}>{lede}</p> : null;
}

/** The section's Markdown, where the template wants it. */
export function Body({ className }: { className?: string }) {
  const { body } = useSection();
  return body ? <Prose text={body} className={className} /> : null;
}

/** The ruled column beside the body; the frame places it. */
export function Aside({ className }: { className?: string }) {
  const { aside } = useSection();
  return aside ? <Prose as="aside" text={aside} className={cn("text-muted-foreground text-sm", className)} /> : null;
}

// ---- its items ----------------------------------------------------------------

/** Item `i` of the section. By index, so the builder knows which one an edit is for. */
const useItem = (i: number) => useSection().items?.[i];

export function ItemTitle({ i, as: H = "h3", className }: { i: number; as?: "h3" | "h4" | "p"; className?: string }) {
  const it = useItem(i);
  return it?.title ? <H className={cn(HEAD, "text-lg text-balance", className)}>{it.title}</H> : null;
}

export function ItemText({ i, className }: { i: number; className?: string }) {
  const it = useItem(i);
  return it?.text ? <Prose text={it.text} className={cn("text-sm", className)} /> : null;
}

/** Under the item's picture: its caption, else the asset's description. */
export function ItemCaption({ i, as: C = "p", className }: { i: number; as?: "p" | "figcaption"; className?: string }) {
  const it = useItem(i);
  const media = useMedia(it?.asset);
  const text = it?.caption ?? media?.description;
  return text ? <C className={cn("text-muted-foreground text-sm", className)}>{text}</C> : null;
}

// ---- the rules it shows -------------------------------------------------------

/**
 * The id the first specimen of a key on the page carries, `rule-{key}`, so
 * v1's links still land (lib/site.ts legacyAnchor); undefined anywhere else.
 * RuleSlot sets it itself; a template drawing a value its own way puts it on
 * the element that shows it.
 */
export function useRuleAnchor(): (key: string) => string | undefined {
  const { view, idOf } = useSite();
  const { section, anchors } = useScope();
  const sections = view.page?.sections;
  return useCallback(
    (key: string) => (anchors && sections && firstBinding(sections, key) === section.id ? idOf(`rule-${key}`) : undefined),
    [anchors, sections, section.id, idOf],
  );
}

/** RuleView and ValueEditor tell a key's versions apart by id, which a view's rules don't carry. */
const useAsRule = (r: ViewRule): Rule => useMemo(() => ({ ...r, id: `${r.key}@${r.context ?? ""}` }), [r]);

const ignore = () => {};

/** A rule as a block: its name, its value as a specimen, its note and its pictures, for reading. */
export function RuleSlot({ rule, stacked }: { rule: ViewRule; /** A color as a card in a grid. */ stacked?: boolean }) {
  const r = useAsRule(rule);
  const anchor = useRuleAnchor()(rule.key);
  return (
    <ReadOnly.Provider value={true}>
      <RuleView rules={[r]} anchor={anchor} line={null} dragging={false} stacked={stacked} />
    </ReadOnly.Provider>
  );
}

/** Only the rule's value as a specimen (a swatch, a face, a list), for a template laying out the rest itself. */
export function RuleValue({ rule, stacked }: { rule: ViewRule; stacked?: boolean }) {
  const r = useAsRule(rule);
  return (
    <ReadOnly.Provider value={true}>
      <ValueEditor rule={r} onSave={ignore} stacked={stacked} />
    </ReadOnly.Provider>
  );
}

// ---- Markdown -----------------------------------------------------------------

/**
 * A page's Markdown: headings one level under the section's, the brand's own
 * links (/logo, /logo#clear-space, #clear-space) to where the site is shown,
 * and a copy button on each code block once the page is live (the server's
 * page reads fine without).
 */
function Prose({ text, as: El = "div", className }: { text: string; as?: "div" | "aside"; className?: string }) {
  const { view, href } = useSite();
  const here = view.page?.slug ?? "";
  const html = useMemo(
    () =>
      renderMarkdown(text, {
        demote: 1,
        base: (path) => {
          const m = SITE_PATH.exec(path);
          return m ? href(m[1] ?? here, m[2]) : path;
        },
      }),
    [text, href, here],
  );
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    for (const pre of ref.current?.querySelectorAll("pre[data-copy]") ?? []) {
      if (pre.querySelector(":scope > .copy-code")) continue;
      pre.append(Object.assign(document.createElement("button"), { type: "button", className: "copy-code", textContent: "Copy" }));
    }
  }, [html]);
  return (
    <El
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn("rich prose-brand", className)}
      onClick={async (e) => {
        const b = (e.target as Element).closest<HTMLButtonElement>("button.copy-code");
        const code = b?.parentElement?.querySelector("code")?.textContent;
        if (!b || code == null || !(await copyText(code, { what: "the code" }))) return;
        b.textContent = "Copied";
        setTimeout(() => (b.textContent = "Copy"), 1500);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
