"use client";

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { IconPhoto, IconUpload } from "@tabler/icons-react";
import { toast } from "sonner";
import { HEAD, LABEL } from "@/components/brand-sections/look";
import { BrandIcon, markOf } from "@/components/brand-sections/parts";
import { onceDrawn, RuleView } from "@/components/brand-sections/rule-view";
import { ReadOnly, ValueEditor } from "@/components/brand-values";
import { copyText } from "@/components/copy-button";
import type { Asset } from "@/components/gallery";
import { useEdit, useMedia, usePicked, useSite, type Edit, type Site } from "@/components/site/site-context";
import { Button } from "@/components/ui/button";
import { insertItems, removeItem } from "@/lib/builder-ops";
import { renderMarkdown, SITE_PATH } from "@/lib/markdown";
import { TEMPLATE_INFO, type Item, type Section, type Template } from "@/lib/pages";
import { hasPreview } from "@/lib/preview";
import { ruleName, type Rule } from "@/lib/rules";
import { firstBinding, type Media, type ViewAsset, type ViewRule } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Where a section's own words go: its eyebrow, title, lede, body and aside,
 * its items' titles, texts, captions and labels, and the rules it shows.
 * Templates place these and never print the strings themselves, so the
 * builder makes each one editable here, in one file, and no template
 * branches on editing (D12). The frame (frame.tsx) says which section they
 * read. Where the site is read (no EditContext) they draw exactly what they
 * always drew; on the builder's canvas the words are typed where they read.
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

/** A section with nothing in it yet: no words, rules or items. On the canvas its title and body slots show unpicked. */
export const blank = (s: Section) => !s.title && !s.body && !s.eyebrow && !s.lede && !s.keys.length && !s.items?.length;

/** The section the slots around here read. */
export const useSection = () => useScope().section;

/** The id of a section's heading, which the frame names the section by. */
export const titleOf = (domId: string) => `${domId}-title`;

// ---- the section's words ------------------------------------------------------

export function Eyebrow({ className }: { className?: string }) {
  const { eyebrow } = useSection();
  const typing = useWords("eyebrow", eyebrow);
  const look = cn(LABEL, "text-muted-foreground", className);
  if (typing) return <Plain as="p" {...typing} label="Eyebrow" className={look} />;
  return eyebrow ? <p className={look}>{eyebrow}</p> : null;
}

/** The section's heading: an h2 under the page's h1, unless a cover opening the page makes it the h1. On the theme's scale, held to the container on a phone. */
export function Title({ as: H = "h2", className }: { as?: "h1" | "h2" | "h3"; className?: string }) {
  const s = useSection();
  const { idOf } = useSite();
  const typing = useWords("title", s.title);
  const heading = { id: titleOf(idOf(s.id)), className: cn(HEAD, "text-[length:min(var(--brand-h2),8cqi)] leading-tight text-balance", className) };
  if (typing) return <Plain as={H} {...heading} {...typing} label="Title" />;
  if (!s.title) return null;
  return <H {...heading}>{s.title}</H>;
}

/** A line or two under the title, set large. Plain text. */
export function Lede({ className }: { className?: string }) {
  const { lede } = useSection();
  const typing = useWords("lede", lede);
  const look = cn("text-muted-foreground text-lg text-pretty @3xl:text-xl", className);
  if (typing) return <Plain as="p" {...typing} label="Lede" className={look} />;
  return lede ? <p className={look}>{lede}</p> : null;
}

/** The section's Markdown, where the template wants it. */
export function Body({ className }: { className?: string }) {
  const { body } = useSection();
  const typing = useWords("body", body);
  if (typing) return <Rich {...typing} label="Body" className={className} />;
  return body ? <Prose text={body} className={className} /> : null;
}

/**
 * A template's own words kept in its props (a quote's `by`, a request's
 * `prompt`, an embed's `url`): typed where they read, as the section's are,
 * the empty slot named by `label` while its section is picked. `shown`:
 * what readers get when it is left out, the template's own default.
 */
export function PropText({
  name,
  label,
  shown,
  canvas,
  as: El = "span",
  className,
}: {
  name: string;
  label: string;
  shown?: string;
  /** Typed on the canvas, never printed for readers (an embed's address: they get the frame). */
  canvas?: boolean;
  as?: "p" | "span";
  className?: string;
}) {
  const s = useSection();
  const edit = useEdit();
  const picked = usePicked();
  const value = typeof s.props[name] === "string" ? (s.props[name] as string) : undefined;
  if (edit && !edit.lang && (value || picked))
    return (
      <Plain
        as={El}
        value={value ?? ""}
        label={shown ?? label}
        className={className}
        onFocus={picker(edit, s, picked)}
        onSave={(next) => {
          const props = { ...s.props, [name]: next || undefined };
          if (!next) delete props[name];
          edit.update(s.id, { props });
        }}
      />
    );
  const text = canvas ? undefined : (value ?? shown);
  return text ? <El className={className}>{text}</El> : null;
}

/** The ruled column beside the body; the frame places it. */
export function Aside({ className }: { className?: string }) {
  const { aside } = useSection();
  const typing = useWords("aside", aside);
  const look = cn("text-muted-foreground text-sm", className);
  if (typing) return <Rich {...typing} label="Aside" as="aside" className={look} />;
  return aside ? <Prose as="aside" text={aside} className={look} /> : null;
}

// ---- its items ----------------------------------------------------------------

/** Marks an item's root element, so the builder's canvas finds it to drag and right click: by index, as the slots are. */
export const itemRoot = (i: number | undefined) => (i === undefined ? {} : { "data-item-root": i });

/** Item `i` of the section. By index, so the builder knows which one an edit is for. */
const useItem = (i: number) => useSection().items?.[i];

export function ItemTitle({ i, as: H = "h3", className }: { i: number; as?: "h3" | "h4" | "p"; className?: string }) {
  const it = useItem(i);
  const typing = useItemWords(i, "title", it?.title);
  const look = cn(HEAD, "min-w-0 text-(length:--brand-h3) leading-snug text-balance", className);
  if (typing) return <Plain as={H} {...typing} label="Item title" className={look} />;
  return it?.title ? <H className={look}>{it.title}</H> : null;
}

export function ItemText({ i, className }: { i: number; className?: string }) {
  const it = useItem(i);
  const typing = useItemWords(i, "text", it?.text);
  const look = cn("text-sm", className);
  if (typing) return <Rich {...typing} label="Item text" className={look} />;
  return it?.text ? <Prose text={it.text} className={look} /> : null;
}

/** Under the item's picture: its caption, else the asset's description. On the canvas, with a way to change the picture. */
export function ItemCaption({ i, as: C = "p", className }: { i: number; as?: "p" | "figcaption"; className?: string }) {
  const it = useItem(i);
  const media = useMedia(it?.asset);
  const text = it?.caption ?? media?.description;
  const typing = useItemWords(i, "caption", text ?? undefined);
  const look = cn("text-muted-foreground text-sm", className);
  if (typing)
    return (
      <>
        <Plain as={C} {...typing} label="Caption" className={look} />
        <ItemMedia i={i} />
      </>
    );
  return text ? <C className={look}>{text}</C> : null;
}

/** A fold readers open, one at a time in `name` (a question's answer). On the canvas it stays open, so the words in it can be typed. */
export function ItemFold({ i, name, className, children }: { i?: number; name?: string; className?: string; children: React.ReactNode }) {
  const edit = useEdit();
  return (
    <details {...itemRoot(i)} name={edit ? undefined : name} open={edit ? true : undefined} className={className}>
      {children}
    </details>
  );
}

/** The item's small tag (Figma, PDF, Partners only), for a template to set where it wants. Written once for every language. */
export function ItemLabel({ i, as: L = "span", className }: { i: number; as?: "span" | "p"; className?: string }) {
  const it = useItem(i);
  const typing = useItemWords(i, "label", it?.label);
  if (typing) return <Plain as={L} {...typing} label="Label" className={className} />;
  return it?.label ? <L className={className}>{it.label}</L> : null;
}

/**
 * A picture picked from the library or uploaded from the computer, for
 * `use`: `pick` opens the library, `upload` the computer's file dialog, and
 * `ui` (rendered anywhere) holds the dialog and the file input.
 */
function usePicking(use: (a: Asset) => void, o: { title: string; description: string; accept?: string; done?: (name: string) => string }) {
  const [picking, setPicking] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const ui = (
    <>
      <input
        ref={file}
        type="file"
        accept={o.accept ?? "image/*"}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const id = toast.loading(`Uploading ${f.name}`);
          upload(f).then(
            (a) => {
              toast.success(o.done?.(f.name) ?? `${f.name} is in the library`, { id });
              use(a);
            },
            (err: Error) => toast.error(err.message, { id }),
          );
        }}
      />
      {picking && (
        <Suspense>
          <LibraryPicker
            title={o.title}
            description={o.description}
            onClose={() => setPicking(false)}
            onPick={(a) => {
              setPicking(false);
              use(a);
            }}
          />
        </Suspense>
      )}
    </>
  );
  return { pick: () => setPicking(true), upload: () => file.current?.click(), ui };
}

/**
 * On the canvas, while its section is picked: where item `i`'s picture is
 * picked from the library or uploaded. Nothing where the site is read, or
 * while a translation shows (a picture is the same in every language).
 * ItemCaption carries it; a template whose items have no caption places it
 * by its picture.
 */
export function ItemMedia({ i, className }: { i: number; className?: string }) {
  const edit = useEdit();
  const picked = usePicked();
  const s = useSection();
  const { url } = useSite();
  const it = s.items?.[i];
  const { pick, upload, ui } = usePicking(
    (a) => {
      edit?.addMedia([asMedia(a, url)]);
      edit?.update(s.id, { items: s.items!.map((x, k) => (k === i ? { ...x, asset: a.id } : x)) });
    },
    { title: "Pick a picture", description: "From the library, for this item.", accept: "image/*,video/*" },
  );
  if (!edit || edit.lang || !picked || !it) return null;
  return (
    <div className={cn("app-tokens flex flex-wrap gap-1", className)}>
      <Button type="button" variant="outline" size="xs" onClick={pick}>
        <IconPhoto /> {it.asset ? "Replace" : "Add a picture"}
      </Button>
      <Button type="button" variant="outline" size="xs" onClick={upload}>
        <IconUpload /> Upload
      </Button>
      {ui}
    </div>
  );
}

/**
 * Where a block's own picture goes (an annotated image's, a split's, a
 * quote's portrait: props `name`), on the canvas while it has none: a frame
 * to pick one or upload one, where it will show. Readers get nothing; a
 * picture once set is changed from the section's toolbar, or by a double
 * click on it.
 */
export function PropPicture({ name = "image", label, className }: { name?: string; label: string; className?: string }) {
  const edit = useEdit();
  const s = useSection();
  const { url } = useSite();
  const { pick, upload, ui } = usePicking(
    (a) => {
      edit?.addMedia([asMedia(a, url)]);
      edit?.update(s.id, { props: { ...s.props, [name]: a.id } });
    },
    { title: "Pick a picture", description: label },
  );
  if (!edit || edit.lang || typeof s.props[name] === "string") return null;
  return (
    <div className={cn("app-tokens text-muted-foreground grid place-items-center gap-3 rounded-xl border border-dashed p-8 text-center text-sm", className)}>
      <IconPhoto aria-hidden className="size-6" />
      <p>{label}</p>
      <div className="flex flex-wrap justify-center gap-1">
        <Button type="button" variant="outline" size="sm" onClick={pick}>
          <IconPhoto /> Pick from the library
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={upload}>
          <IconUpload /> Upload
        </Button>
      </div>
      {ui}
    </div>
  );
}

/**
 * A picture items sit on at a point (an annotated image's hotspots, `at` in
 * percent from its top left). On the canvas, while its section is picked, a
 * click on the picture puts a new item there, and an item's marker
 * (`data-at={i}`) is dragged to move it. Readers get the picture as it is.
 */
export function Placing({ className, style, children }: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const edit = useEdit();
  const picked = usePicked();
  const s = useSection();
  const ref = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  if (!edit || edit.lang || !picked)
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  const point = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    const pct = (v: number) => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
    return [pct(((e.clientX - r.left) / r.width) * 100), pct(((e.clientY - r.top) / r.height) * 100)];
  };
  const items = s.items ?? [];
  return (
    <div
      ref={ref}
      className={cn(className, "cursor-crosshair")}
      style={style}
      title="Click to add a hotspot here; drag one to move it"
      onPointerDown={(e) => {
        const marker = (e.target as Element).closest<HTMLElement>("[data-at]");
        if (!marker || e.button !== 0) return;
        const i = Number(marker.dataset.at);
        moved.current = false;
        const start = { x: e.clientX, y: e.clientY };
        const move = (m: PointerEvent) => {
          if (!moved.current && Math.hypot(m.clientX - start.x, m.clientY - start.y) < 4) return;
          moved.current = true;
          const [x, y] = point(m);
          // physical: `at` is measured on the picture, which reads the same in any script.
          marker.style.left = `${x}%`;
          marker.style.top = `${y}%`;
        };
        const up = (u: PointerEvent) => {
          removeEventListener("pointermove", move);
          removeEventListener("pointerup", up);
          if (moved.current) edit.update(s.id, { items: items.map((x, k) => (k === i ? { ...x, at: point(u) } : x)) });
        };
        addEventListener("pointermove", move);
        addEventListener("pointerup", up);
      }}
      onClickCapture={(e) => {
        // A drag isn't a click: the marker's note stays shut.
        if (moved.current) {
          moved.current = false;
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      onClick={(e) => {
        if ((e.target as Element).closest("[data-at], button, a, [role=dialog]")) return;
        edit.update(s.id, insertItems(s, items.length, [{ at: point(e), title: "" }]));
      }}
    >
      {children}
    </div>
  );
}

// ---- the brand's mark ---------------------------------------------------------

/**
 * The brand's mark where a template shows it (a cover). On the canvas it is
 * the way to change it: a click picks the logo from the library or uploads
 * one, and the pick becomes the picture of the logo rule the mark is drawn
 * from (markOf), else of logo.primary, made if it isn't there. So the site's
 * header, every page and agents reading brand_rules get the same logo.
 */
export function Mark(props: React.ComponentProps<typeof BrandIcon>) {
  const edit = useEdit();
  const { view, url } = useSite();
  const defaults = view.rules.filter((r) => r.context === null);
  const had = markOf(defaults) ?? defaults.find((r) => r.key === "logo.primary");
  const { pick, upload, ui } = usePicking(
    (a) => {
      const m = asMedia(a, url);
      edit?.addMedia([m]);
      const picture: ViewAsset = { id: a.id, rendition: null, title: m.title, filename: m.filename, mime: m.mime, size: m.size, width: m.width, height: m.height, preview: !!m.preview, supersededBy: null };
      // The new picture takes the place of the one the mark showed; the rule's other files (an SVG beside a PNG) stay.
      const others = had?.assets.filter((x) => x.id !== a.id) ?? [];
      edit?.setRule(
        had
          ? { ...had, assets: [picture, ...(markOf([had]) ? others.slice(1) : others)] }
          : { key: "logo.primary", context: null, type: "text", label: "Primary logo", value: "The approved logo", usage: null, spec: null, assets: [picture] },
      );
    },
    { title: "Pick the logo", description: "It shows on the cover, in the site's header and to agents reading the brand.", done: (n) => `${n} is the logo` },
  );
  if (!edit || edit.lang) return <BrandIcon {...props} />;
  const name = had && markOf([had]) ? "Change the logo" : "Add the logo";
  return (
    <span className="group/mark relative inline-flex shrink-0">
      <button type="button" aria-label={name} title={name} onClick={pick} className="focus-visible:ring-ring/50 flex rounded-2xl outline-none focus-visible:ring-3">
        <BrandIcon {...props} />
      </button>
      <span className="app-tokens absolute -bottom-3 start-0 flex translate-y-full gap-1 opacity-0 transition-opacity group-focus-within/mark:opacity-100 group-hover/mark:opacity-100">
        <Button type="button" variant="outline" size="xs" onClick={pick}>
          <IconPhoto /> {name}
        </Button>
        <Button type="button" variant="outline" size="xs" onClick={upload}>
          <IconUpload /> Upload
        </Button>
      </span>
      {ui}
    </span>
  );
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

/** A rule as a block: its name, its value as a specimen, its note and its pictures, for reading. On the canvas a click opens its card. */
export function RuleSlot({ rule, stacked }: { rule: ViewRule; /** A color as a card in a grid. */ stacked?: boolean }) {
  const r = useAsRule(rule);
  const anchor = useRuleAnchor()(rule.key);
  return (
    <Opens rule={rule}>
      <ReadOnly.Provider value={true}>
        <RuleView rules={[r]} anchor={anchor} line={null} dragging={false} stacked={stacked} />
      </ReadOnly.Provider>
    </Opens>
  );
}

/** Only the rule's value as a specimen (a swatch, a face, a list), for a template laying out the rest itself. On the canvas words and lists are typed in place; the rest opens its card. */
export function RuleValue({ rule, stacked }: { rule: ViewRule; stacked?: boolean }) {
  const r = useAsRule(rule);
  const edit = useEdit();
  if (edit && (rule.type === "text" || rule.type === "list"))
    return (
      <ReadOnly.Provider value={false}>
        <ValueEditor rule={r} stacked={stacked} onSave={(value) => edit.setRule({ ...rule, value })} />
      </ReadOnly.Provider>
    );
  return (
    <Opens rule={rule}>
      <ReadOnly.Provider value={true}>
        <ValueEditor rule={r} onSave={ignore} stacked={stacked} />
      </ReadOnly.Provider>
    </Opens>
  );
}

/**
 * On the canvas a specimen is the way into its rule: a click on it (not on
 * a copy button or a link in it) opens the rule's card there, which the
 * canvas draws. A template's own specimen button (a swatch that copies when
 * read) marks itself `data-specimen` and opens the card instead. A button,
 * shown when focused, does the same from the keyboard.
 */
export function Opens({ rule, children }: { rule: ViewRule; children: React.ReactNode }) {
  const edit = useEdit();
  if (!edit) return children;
  return (
    <div
      className="relative cursor-pointer"
      onClickCapture={(e) => {
        if (!(e.target as Element).closest("[data-specimen]")) return;
        e.stopPropagation();
        edit.openRule(rule.key, e.currentTarget);
      }}
      onClick={(e) => {
        if (!(e.target as Element).closest("a, button, input, textarea, [contenteditable], [role=tab]")) edit.openRule(rule.key, e.currentTarget);
      }}
    >
      <button
        type="button"
        onClick={(e) => edit.openRule(rule.key, e.currentTarget.parentElement!)}
        className="app-tokens bg-background text-foreground focus-visible:ring-ring/40 pointer-events-none absolute end-2 top-2 z-10 rounded-md border px-2 py-1 text-xs opacity-0 shadow-sm outline-none focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2"
      >
        Edit {ruleName(rule)}
      </button>
      {children}
    </div>
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

// ---- typing on the canvas -----------------------------------------------------

type Word = "title" | "eyebrow" | "lede" | "body" | "aside";
type ItemWord = "title" | "text" | "caption" | "label";

/** What a slot being typed in is handed. */
type Typing = {
  value: string;
  onSave(next: string): void;
  onFocus(): void;
  /** Enter, with the words typed: in place of leaving. */
  onEnter?: (next: string, el: HTMLElement) => void;
  /** Backspace in the emptied slot. */
  onClear?: (el: HTMLElement) => void;
  /** Which item and which of its words, so Enter and Backspace find the slot to go on to. */
  item?: number;
  word?: string;
};

/** Typing in a slot picks its section, so the canvas shows its toolbar and its empty slots. */
const picker = (edit: Edit, s: Section, picked: boolean) => () => {
  if (!picked) edit.select({ section: s.id });
};

/**
 * On the canvas, the words a slot shows and how they save: in the language
 * the canvas shows, into the section's translations when that isn't the one
 * it is written in. Null where the site is read, and for an empty slot
 * unless its section is picked, so empty slots show only where they can be
 * filled.
 */
function useWords(field: Word, value: string | undefined): Typing | null {
  const edit = useEdit();
  const picked = usePicked();
  const s = useSection();
  // A section with nothing in it yet shows where its title and words go, picked or not, so it never reads as a blank band.
  if (!edit || (!value && !picked && !(blank(s) && (field === "title" || field === "body")))) return null;
  const { lang } = edit;
  return {
    value: value ?? "",
    // Cleared, an optional field goes (null); a title or body goes back to empty.
    onSave: (next) => edit.update(s.id, lang ? { translations: translated(s, lang, { [field]: next || undefined }) } : { [field]: next || null }),
    onFocus: picker(edit, s, picked),
  };
}

/**
 * Item `i`'s words, as useWords. As written, Enter adds an item after it
 * where words alone make one (a card), and Backspace in an emptied slot of
 * an item with nothing else in it removes the item. A translation changes
 * only words, never the list; an item's label is the same in every language.
 */
function useItemWords(i: number, field: ItemWord, value: string | undefined): Typing | null {
  const edit = useEdit();
  const picked = usePicked();
  const s = useSection();
  const it = s.items?.[i];
  // An item with nothing in it yet (a new card, a question) shows where its title goes, picked or not.
  if (!edit || !it || (!value && !picked && !(field === "title" && STUFF.every((f) => !it[f])))) return null;
  const { lang } = edit;
  if (lang && field === "label") return null;
  const items = s.items!;
  const typed = (next: string) => items.map((x, k) => (k === i ? word(s.template, x, field, next) : x));
  const base = { value: value ?? "", onFocus: picker(edit, s, picked), item: i, word: field };
  if (lang) return { ...base, onSave: (next) => edit.update(s.id, { translations: translated(s, lang, { [field]: next || undefined }, i) }) };
  const bare = STUFF.every((f) => f === field || !it[f]);
  return {
    ...base,
    onSave: (next) => edit.update(s.id, { items: typed(next) }),
    onEnter: fits(s.template, BLANK)
      ? (next, el) => {
          const find = finder(el);
          // At the same depth as the one it follows (a cards tree); translations keep lining up by position.
          edit.update(s.id, insertItems({ ...s, items: typed(next) }, i + 1, [{ ...BLANK, ...(it.level !== undefined && { level: it.level }) }]));
          // Once React has drawn the new item.
          requestAnimationFrame(() => onceDrawn(() => find(i + 1, "title"), focusEnd));
        }
      : undefined,
    onClear: bare
      ? (el) => {
          const find = finder(el);
          edit.update(s.id, removeItem(s, i));
          const prev = find(i - 1, field) ?? find(i - 1, "title");
          if (prev) focusEnd(prev);
        }
      : undefined,
  };
}

/** What an item holds besides its verdict: with none of it, Backspace may take the item away. */
const STUFF = ["title", "text", "caption", "label", "asset", "key", "link", "icon"] as const;

/** A new item from Enter: a title to type. */
const BLANK: Item = { title: "" };

/** An item has what its template can't do without (TEMPLATE_INFO `needs`): each group, one of its fields. */
const fits = (t: Template, it: Item) => (TEMPLATE_INFO[t].needs ?? []).every((g) => g.some((f) => it[f] !== undefined));

/** An item with a word typed. Cleared, the word goes, unless the template needs it: a card keeps its title, empty. */
function word(t: Template, it: Item, field: ItemWord, next: string): Item {
  const rest = { ...it };
  delete rest[field];
  return next || !fits(t, rest) ? { ...it, [field]: next } : rest;
}

/** The section's translations with `lang`'s words set; an item's by its index, the others kept by position (null: as written). */
function translated(s: Section, lang: string, words: Record<string, string | undefined>, i?: number) {
  const t = s.translations?.[lang] ?? {};
  const set =
    i === undefined
      ? { ...t, ...words }
      : { ...t, items: Array.from({ length: Math.max(t.items?.length ?? 0, i + 1) }, (_, k) => (k === i ? { ...t.items?.[k], ...words } : (t.items?.[k] ?? null))) };
  return { ...s.translations, [lang]: set };
}

/** Item slots in the copy of the section `el` is in (a context tab draws a copy each), found after `el` itself may be gone. */
function finder(el: HTMLElement) {
  const section = el.closest("section");
  const panel = el.closest('[role="tabpanel"]');
  return (i: number, w: string) =>
    [...(section?.querySelectorAll<HTMLElement>(`[data-item="${i}"][data-word="${w}"]`) ?? [])].find((x) => x.closest('[role="tabpanel"]') === panel);
}

/** The caret at the end of a slot's words. */
function focusEnd(el: HTMLElement) {
  el.focus();
  const sel = getSelection();
  sel?.selectAllChildren(el);
  sel?.collapseToEnd();
}

/** A slot being typed in: the page's own look, a wash under the pointer, a ring while typing, its name while empty. */
const TYPING =
  "cursor-text rounded-sm outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 empty:before:text-muted-foreground/60 empty:before:content-[attr(data-placeholder)]";

/**
 * Plain words typed where they read, one line: Enter commits (or adds the
 * next item), Esc leaves, and leaving saves only a change. Pasting keeps the
 * text, not its formatting. A new value from outside (a save, undo) draws a
 * fresh element, so React never fights the browser over the text in it.
 */
function Plain({
  as: El,
  value,
  onSave,
  onFocus,
  onEnter,
  onClear,
  item,
  word: w,
  label,
  id,
  className,
}: Typing & { as: "p" | "span" | "figcaption" | "h1" | "h2" | "h3" | "h4"; label: string; id?: string; className?: string }) {
  // Enter or Backspace saved already: the blur that follows has nothing to add.
  const done = useRef(false);
  const read = (el: HTMLElement) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return (
    <El
      key={value}
      id={id}
      className={cn(TYPING, className)}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-label={label}
      data-placeholder={label}
      data-item={item}
      data-word={w}
      spellCheck
      onFocus={() => {
        done.current = false;
        onFocus();
      }}
      onBlur={(e) => {
        const next = read(e.currentTarget);
        if (!done.current && next !== value) onSave(next);
      }}
      // Inside a link (a card's title), a click is for typing, not for following it.
      onClick={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        if (e.key === "Enter") {
          e.preventDefault();
          if (!onEnter) return el.blur();
          done.current = true;
          onEnter(read(el), el);
        } else if (e.key === "Escape") {
          e.preventDefault();
          el.blur();
        } else if (e.key === "Backspace" && onClear && !el.textContent) {
          e.preventDefault();
          done.current = true;
          onClear(el);
        }
      }}
      // In a fold's summary, a space typed would toggle the fold.
      onKeyUp={(e) => e.key === " " && e.preventDefault()}
    >
      {value}
    </El>
  );
}

const LazyRichText = lazy(() => import("@/components/rich-text"));
const never = () => () => {};

/**
 * Markdown typed where it reads: the rich editor, fetched with the first
 * text on the canvas, headings one level under the section's as readers see
 * them. Until it is in, and on the server, the text shows as readers see it.
 */
function Rich({ value, onSave, onFocus, label, as, className }: Typing & { label: string; as?: "div" | "aside"; className?: string }) {
  const client = useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
  const still = <Prose text={value} as={as} className={className} />;
  if (!client) return still;
  return (
    <div className="contents" onFocus={onFocus}>
      <Suspense fallback={still}>
        <LazyRichText value={value} onSave={onSave} label={label} demote={1} className={cn("prose-brand", className)} />
      </Suspense>
    </div>
  );
}

// ---- pictures for items -------------------------------------------------------

// Only on the canvas, and only once asked for: readers never fetch them.
const LibraryPicker = lazy(() => import("@/components/asset-picker").then((m) => ({ default: m.LibraryPicker })));

/** A file into the library, as the gallery sends one: a ticket, the bytes straight to storage, then the asset. */
export async function upload(file: File): Promise<Asset> {
  const mime = file.type || "application/octet-stream";
  const post = (path: string, body: object) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const ticket = await post("/api/v1/uploads", { filename: file.name, mime, size: file.size });
  if (!ticket.ok) throw new Error((await ticket.json().catch(() => null))?.error?.message ?? "Upload failed");
  const { token, uploadUrl } = await ticket.json();
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mime }, body: file });
  if (!put.ok) throw new Error("Storage refused the upload");
  const res = await post("/api/v1/assets", { token, filename: file.name, mime });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.data) throw new Error(body?.error?.message ?? "Couldn't add it to the library");
  return body.data;
}

/** A library asset as a page's media, so the canvas draws it before the page is loaded again. */
export function asMedia(a: Asset, url: Site["url"]): Media {
  const m = a.metadata ?? {};
  const still = hasPreview(a);
  return {
    id: a.id,
    filename: a.filename,
    title: m.title ?? null,
    description: m.description ?? null,
    creator: m.creator ?? null,
    copyright: m.copyright ?? null,
    mime: a.mime,
    size: a.size,
    width: a.width,
    height: a.height,
    thumbnail: still ? url(a.id, "/w_640,f_webp") : null,
    preview: still ? url(a.id, "/w_1600,f_webp") : null,
    original: url(a.id),
    downloads: [],
    focus: null,
    updatedAt: a.updatedAt,
  };
}
