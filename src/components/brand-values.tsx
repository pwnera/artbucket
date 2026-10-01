"use client";

import { createContext, lazy, Suspense, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { IconCheck, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import { copyText, CopyButton } from "@/components/copy-button";
import { useAssetFont } from "@/components/font-preview";
import { contrast, grade, hexOf, hsl, inkOn, isHex, rgb } from "@/lib/color";
import { kebab } from "@/lib/tokens";
import { renderMarkdown } from "@/lib/markdown";
import { fontFiles, fontStyle, pickFace, weightName } from "@/lib/font";
import { fontValue, listStyle, section, type FontValue, type ListStyle, type Rule, type RuleValue } from "@/lib/rules";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Inside, values render as the page, not as fields: for readers, who may
 * copy from them but not change them, and in a brand portal.
 */
export const ReadOnly = createContext(false);

/**
 * How each kind of rule looks, and how it is edited: the two are the same
 * element, read-only on the page. A color is a swatch with its readouts and
 * contrast; a type scale is a specimen; a do or don't list marks each item
 * with a check or a cross.
 */
export function ValueEditor({
  rule: r,
  onSave,
  onEmpty,
  stacked,
}: {
  rule: Rule;
  onSave: (v: RuleValue) => void;
  /** Everything was cleared: offered as a way to delete the rule instead. */
  onEmpty?: () => void;
  /** A color as a card in a palette grid: the swatch over its readouts, never beside them. */
  stacked?: boolean;
}) {
  switch (r.type) {
    case "color":
      return <ColorEditor value={r.value as string} name={r.key} stacked={stacked} onSave={onSave} />;
    case "font":
      return <FontEditor rule={r} onSave={onSave} />;
    case "list": {
      const value = r.value as (string | number)[];
      const look = listStyle(r.key, value);
      const set = look === "scale" ? pickFace(fontFiles(r))?.id : undefined;
      return <ListEditor value={value} look={look} fontId={set} onSave={onSave} onEmpty={onEmpty} />;
    }
    case "number":
      return (
        <Editable
          value={String(r.value)}
          inputMode="decimal"
          className="font-mono text-3xl font-medium tracking-tight tabular-nums"
          onSave={(v) => {
            if (v === "" || !Number.isFinite(Number(v))) return false;
            onSave(Number(v));
          }}
        />
      );
    default:
      return <TextEditor rule={r} onSave={onSave} onEmpty={onEmpty} />;
  }
}

/**
 * Markdown as the page shows it: rendered here, so it arrives from the server
 * ready to read. `demote`: a rule's text or note, whose headings sit under its name.
 */
export function Markdown({
  text,
  className,
  style,
  demote,
}: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  demote?: boolean;
}) {
  return <div className={cn("rich", className)} style={style} dangerouslySetInnerHTML={{ __html: renderMarkdown(text, { demote }) }} />;
}

const LazyRichText = lazy(() => import("@/components/rich-text"));
const never = () => () => {};

/**
 * The rich editor loads with the first text someone can edit, not with the
 * page: readers never download it. Until it is in (and on the server, where
 * it can't run), the text shows as the page renders it, so nothing flashes.
 */
export function RichText(props: React.ComponentProps<typeof LazyRichText>) {
  const client = useSyncExternalStore(never, () => true, () => false);
  const still = <Markdown text={props.value} className={cn("min-h-[1lh]", props.className)} style={props.style} demote />;
  return client ? (
    <Suspense fallback={still}>
      <LazyRichText {...props} />
    </Suspense>
  ) : (
    still
  );
}

/** Rich text (Markdown), set in the font the rule was given (see SetIn), if any. */
function TextEditor({ rule: r, onSave, onEmpty }: { rule: Rule; onSave: (v: RuleValue) => void; onEmpty?: () => void }) {
  const text = r.value as string;
  const set = useAssetFont(pickFace(fontFiles(r))?.id);
  const readOnly = useContext(ReadOnly);
  // A text rule naming a typeface shows the face, where the browser has it.
  const face = section(r.key) === "type" && /font|family|face/i.test(r.key.split(".").pop()!);
  const look = cn("text-base leading-relaxed", section(r.key) === "tone" && "text-lg");
  const style = set ? { fontFamily: stack(set) } : undefined;
  return (
    <div className="space-y-2">
      {readOnly ? (
        <Markdown text={text} className={look} style={style} demote />
      ) : (
        <RichText
          value={text}
          label="The rule"
          placeholder="Write the rule"
          className={look}
          style={style}
          required
          onEmpty={onEmpty}
          onSave={onSave}
        />
      )}
      {face && (
        <p className="truncate text-4xl leading-tight" style={{ fontFamily: `${stack(text)}${FALLBACK}` }} aria-hidden>
          Aa Bb Cc 0123
        </p>
      )}
    </div>
  );
}

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

/** After the brand's face: where it isn't installed, a sans the reader has, never the browser's Times. */
const FALLBACK = ", ui-sans-serif, system-ui, sans-serif";

/** Specimens draw at most this big; a larger size says so. */
const CAP = 96;
const PARAGRAPH =
  "Good type does its work without being noticed. It sets the pace of a page, carries the voice of the brand, and stays clear from the headline down to the fine print.";
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 &@#%?!.,:;()[]{}\"'";

/** A specimen waits, invisible, while its face loads (`face` undefined), then fades in: it never shows in the fallback first. */
const fadeIn = (face: string | null | undefined) => cn("transition-opacity duration-200", face === undefined && "opacity-0");

/** The CSS family list for a face loaded from a file, falling back to the family by name. */
const stack = (...names: (string | null | undefined)[]) =>
  names
    .filter(Boolean)
    .map((f) => JSON.stringify(f))
    .join(", ");

/**
 * A typeface: its name, the size and weight it is set at, and a specimen in
 * the face. The face comes from the rule's own files (the one at that weight,
 * else the Regular), so a reader sees it without having it installed.
 */
function FontEditor({ rule: r, onSave }: { rule: Rule; onSave: (v: RuleValue) => void }) {
  const v = fontValue(r.value);
  const files = fontFiles(r);
  const id = pickFace(files, v.weight)?.id;
  const face = useAssetFont(id);
  const readOnly = useContext(ReadOnly);
  const weights = files.length
    ? [...new Set(files.map((f) => fontStyle(f.filename ?? "")).filter((s) => !s.italic).map((s) => s.weight))].sort((a, b) => a - b)
    : WEIGHTS;
  // Unset fields are left out, not stored as null: the value stays { family } until someone sizes it.
  const save = (patch: Partial<FontValue>) => {
    const next = { ...v, ...patch };
    onSave(Object.fromEntries(Object.entries(next).filter(([, x]) => x !== undefined)) as FontValue);
  };
  const inFace = { fontFamily: `${stack(face, v.family)}${FALLBACK}`, fontWeight: v.weight };
  const size = v.size ?? 48;
  // Without files the face is the reader's own copy, if they have one; a file the browser can't read shows nothing of it.
  const caveat = !id ? `Shown in ${v.family} only where it is installed.` : face === null ? "Preview unavailable in this browser" : null;
  const facts = [v.size && `${v.size}px`, v.weight && `${v.weight} ${weightName(v.weight)}`].filter(Boolean).join(" · ");

  if (readOnly)
    return (
      <div className="space-y-3">
        <p className={cn("text-4xl tracking-tight break-words", fadeIn(face))} style={inFace}>
          {v.family}
        </p>
        {facts && <p className="text-muted-foreground text-xs">{facts}</p>}
        <p className={cn("text-muted-foreground text-lg leading-relaxed", fadeIn(face))} style={inFace}>
          {PARAGRAPH}
        </p>
        <p className={cn("text-2xl leading-relaxed break-all", fadeIn(face))} style={inFace} aria-hidden>
          {GLYPHS}
        </p>
        {caveat && <p className="text-muted-foreground text-xs">{caveat}</p>}
      </div>
    );
  return (
    <div className="space-y-2">
      <Editable value={v.family} label="Family" className="text-base font-medium" onSave={(f) => f && save({ family: f })} />
      <p
        className={cn("truncate leading-tight", fadeIn(face))}
        style={{ ...inFace, fontSize: `${Math.min(size, CAP)}px` }}
        aria-hidden
      >
        Aa Bb Cc 0123
      </p>
      <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
        <span className="flex items-center gap-1">
          Size
          <Editable
            value={v.size ? String(v.size) : ""}
            placeholder="Any"
            label="Size in pixels"
            inputMode="decimal"
            className="w-12 font-mono tabular-nums"
            onSave={(s) => {
              const n = Number(s);
              if (s === "") save({ size: undefined });
              else if (Number.isFinite(n) && n > 0) save({ size: n });
              else return false;
            }}
          />
          px
          {size > CAP && <span className="text-2xs">(shown at {CAP}px)</span>}
        </span>
        <Select value={v.weight ? String(v.weight) : "any"} onValueChange={(w) => save({ weight: w === "any" ? undefined : Number(w) })}>
          <SelectTrigger size="sm" aria-label="Weight" className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any weight</SelectItem>
            {[...new Set([...weights, ...(v.weight ? [v.weight] : [])])].map((w) => (
              <SelectItem key={w} value={String(w)}>
                {w} {weightName(w)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {caveat && <p className="text-muted-foreground text-xs">{caveat}</p>}
    </div>
  );
}

/**
 * For buttons that can't show a check themselves: copyText, plus a toast
 * saying it worked. CopyButton confirms in place and is the better choice.
 */
export const copy = (text: string, what: string) =>
  copyText(text, { what }).then((ok) => ok && toast.success(`Copied ${what}`));

export { CopyButton };

/**
 * A copy that confirms where you clicked, as CopyButton does, for targets
 * that are bigger than an icon (a swatch, a scale row): `copied` is the text
 * that just went, for 1.5s.
 */
export function useCopied() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = async (text: string, what: string) => {
    if (!(await copyText(text, { what }))) return;
    setCopied(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1500);
  };
  return [copied, run] as const;
}

/**
 * Text that is its own editor: it looks like the page until you click it,
 * saves when you leave it. Enter commits (Shift+Enter for a new line when
 * multiline), Esc puts it back.
 */
export function Editable({
  value,
  onSave,
  placeholder,
  multiline,
  autoFocus,
  className,
  inputMode,
  label,
  style,
  field,
  onDraft,
  onFocus,
  onBlur,
  onKeyDown,
}: {
  value: string;
  /** Returning false refuses the text: the field puts the saved one back and flashes red. */
  onSave: (v: string) => unknown;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  className?: string;
  inputMode?: "decimal";
  label?: string;
  style?: React.CSSProperties;
  /** Marks it for a block's keyboard: data-field="name" is where Enter on a block goes. */
  field?: string;
  /** Each keystroke's text, for a preview beside it; nothing saves until it commits. */
  onDraft?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Runs first: preventDefault skips the built-in Enter and Esc. */
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
}) {
  const readOnly = useContext(ReadOnly);
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  const [refused, setRefused] = useState(false);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  if (readOnly)
    return value ? (
      <p className={cn("break-words whitespace-pre-wrap", className)} style={style}>
        {value}
      </p>
    ) : null;
  return (
    <textarea
      rows={1}
      value={text}
      placeholder={placeholder}
      aria-label={label ?? placeholder}
      inputMode={inputMode}
      spellCheck={multiline}
      autoFocus={autoFocus}
      data-field={field}
      onFocus={(e) => {
        if (autoFocus) e.currentTarget.select();
        onFocus?.();
      }}
      onChange={(e) => {
        const next = multiline ? e.target.value : e.target.value.replace(/\n/g, "");
        setText(next);
        onDraft?.(next);
      }}
      aria-invalid={refused || undefined}
      onBlur={() => {
        const next = text.trim();
        if (next !== value && onSave(next) === false) {
          setText(value);
          setRefused(true);
          setTimeout(() => setRefused(false), 600);
        } else setText(next || value);
        onBlur?.();
      }}
      onKeyDown={(e) => {
        // Only the caller's own preventDefault counts: a Sheet around the field
        // prevents Esc on document first, to stay open, and Esc must still revert.
        const was = e.defaultPrevented;
        onKeyDown?.(e);
        if (!was && e.defaultPrevented) return;
        if (e.key === "Enter" && !(multiline && e.shiftKey)) {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setText(value);
          // After the reset lands, so it doesn't save the old text. On the
          // page, Esc selects the block, as in Notion; elsewhere it just leaves.
          const el = e.currentTarget;
          setTimeout(() => {
            const block = el.closest<HTMLElement>("[data-block]");
            if (block) block.focus();
            else el.blur();
          });
        }
      }}
      className={cn(
        "placeholder:text-muted-foreground/60 hover:bg-muted/60 focus-visible:bg-background focus-visible:ring-ring/40 -mx-1 block w-[calc(100%+0.5rem)] resize-none rounded-md bg-transparent px-1 outline-none field-sizing-content focus-visible:ring-2",
        refused && "ring-destructive/60 ring-2 transition-shadow",
        className,
      )}
      style={style}
    />
  );
}

export const GRADE_STYLE: Record<ReturnType<typeof grade>, string> = {
  AAA: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  AA: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  "AA large": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  fail: "bg-red-500/15 text-red-700 dark:text-red-400",
};

/** Text in this color on white and on black: the ratio, and what it is good for. */
function Contrast({ hex, on }: { hex: string; on: "#ffffff" | "#000000" }) {
  const ratio = contrast(hex, on);
  const g = grade(ratio);
  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-2 py-1.5"
      title={`${hex} text on ${on === "#ffffff" ? "white" : "black"}: ${ratio.toFixed(2)}:1`}
    >
      <span
        className="flex h-6 w-8 items-center justify-center rounded text-sm font-semibold ring-1 ring-black/10 dark:ring-white/10"
        style={{ backgroundColor: on, color: hex }}
      >
        Aa
      </span>
      <span className="font-mono text-xs tabular-nums">{ratio.toFixed(1)}</span>
      <span className={cn("rounded px-1.5 py-0.5 text-2xs font-semibold tracking-wide uppercase", GRADE_STYLE[g])}>
        {g}
      </span>
    </div>
  );
}

/**
 * The swatch is the native color picker (read only, a click copies the hex);
 * the hex beside it is editable text; the readouts, the CSS variable the
 * tokens emit among them, copy on click; contrast is graded against WCAG 2.
 */
function ColorEditor({
  value,
  name,
  stacked,
  onSave,
}: {
  value: string;
  /** The rule's key: its CSS variable in the tokens. */
  name: string;
  stacked?: boolean;
  onSave: (v: string) => void;
}) {
  const [live, setLive] = useState(value);
  const [seen, setSeen] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const readOnly = useContext(ReadOnly);
  const [copied, copy] = useCopied();
  if (value !== seen) {
    setSeen(value);
    setLive(value);
  }
  const valid = isHex(live);
  const hex = valid ? live.slice(0, 7) : "#000000";
  // #rrggbbaa: the swatch shows it over a checker, and the readouts say how see-through.
  const alpha = valid && live.length === 9 ? Math.round((parseInt(live.slice(7), 16) / 255) * 100) : 100;
  const [r, g, b] = rgb(hex);
  const [h, s, l] = hsl([r, g, b]);
  const readouts = [
    ["RGB", alpha < 100 ? `rgb(${r} ${g} ${b} / ${alpha}%)` : `rgb(${r} ${g} ${b})`],
    ["HSL", `hsl(${h} ${s}% ${l}%)`],
    ["CSS", `var(--${kebab(name)})`],
  ];
  const swatch = cn(
    "relative flex h-32 shrink-0 flex-col justify-between overflow-hidden rounded-xl p-3 text-start shadow-sm ring-1 ring-black/10 dark:ring-white/10",
    !stacked && "@md:w-48",
    alpha < 100 && "bg-checker",
  );
  const face = (
    <>
      <span aria-hidden className="absolute inset-0" style={{ backgroundColor: live }} />
      <span className="relative text-3xl font-semibold tracking-tight">Aa</span>
      <span className="relative flex items-center gap-1 font-mono text-xs opacity-80">
        {copied === live ? (
          <>
            <IconCheck className="animate-in zoom-in-50 size-3.5" /> Copied
          </>
        ) : (
          live
        )}
      </span>
    </>
  );

  return (
    <div className={cn("flex flex-col gap-4", !stacked && "@md:flex-row")}>
      {readOnly ? (
        <button
          type="button"
          aria-label={`Copy ${live}`}
          onClick={() => void copy(live, "hex")}
          className={cn(swatch, "cursor-copy transition-[box-shadow,transform] duration-150 hover:shadow-md active:scale-[0.98]")}
          style={{ color: inkOn(hex) }}
        >
          {face}
          <span className="sr-only" aria-live="polite">
            {copied === live ? "Copied" : ""}
          </span>
        </button>
      ) : (
        <label
          className={cn(swatch, "focus-within:ring-ring/50 cursor-pointer transition-shadow focus-within:ring-2 hover:shadow-md")}
          style={{ color: inkOn(hex) }}
        >
          {face}
          <span className="sr-only">Pick a color</span>
          <input
            type="color"
            value={hex}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            onChange={(e) => {
              // The picker has no alpha: an 8-digit hex keeps its own.
              const v = e.target.value + (live.length === 9 ? live.slice(7) : "");
              setLive(v);
              // The picker streams values while you drag; save where it stops.
              clearTimeout(timer.current);
              timer.current = setTimeout(() => onSave(v), 400);
            }}
          />
        </label>
      )}

      <div className="grid min-w-0 flex-1 content-start gap-2 text-sm">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground w-9 text-xs font-medium">HEX</span>
          <Editable
            value={live}
            label="Hex value"
            className="w-40 font-mono text-sm"
            // Fixed here, not refused by the server: shorthand and a missing # are still the color.
            onSave={(typed) => {
              const v = hexOf(typed);
              if (!v) return false;
              setLive(v);
              if (v !== value) onSave(v);
            }}
          />
          <CopyButton text={live} label="Copy hex" what="hex" />
        </div>
        {readouts.map(([k, v]) => (
          <div key={k} className="flex items-center gap-3">
            <span className="text-muted-foreground w-9 text-xs font-medium">{k}</span>
            <code className="w-40 truncate font-mono text-sm">{v}</code>
            <CopyButton text={v} label={k === "CSS" ? "Copy the CSS variable" : `Copy ${k}`} what={k === "CSS" ? "CSS variable" : k} />
          </div>
        ))}
        {valid && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Contrast hex={hex} on="#ffffff" />
            <Contrast hex={hex} on="#000000" />
          </div>
        )}
        {alpha < 100 && <p className="text-muted-foreground text-xs">Contrast is graded at full opacity.</p>}
      </div>
    </div>
  );
}

/** Numbers stay numbers, so a type scale reads back as 12, 14, 16. */
const item = (s: string) => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s);

export const MARKER: Record<Exclude<ListStyle, "scale">, React.ReactNode> = {
  bullets: <span className="bg-foreground/50 mx-1.5 size-1.5 shrink-0 rounded-full" />,
  do: (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
      <IconCheck className="size-3.5" stroke={2.5} />
    </span>
  ),
  dont: (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400">
      <IconX className="size-3.5" stroke={2.5} />
    </span>
  ),
};

/**
 * A list, edited like one: Enter adds an item, Backspace on an empty one
 * removes it, arrows move between them. A scale shows each size set in it.
 */
function ListEditor({
  value,
  look,
  fontId,
  onSave,
  onEmpty,
}: {
  value: (string | number)[];
  look: ListStyle;
  /** A scale's specimen is set in this font file, when the scale names one. */
  fontId?: string;
  onSave: (v: (string | number)[]) => void;
  onEmpty?: () => void;
}) {
  const face = useAssetFont(fontId);
  const readOnly = useContext(ReadOnly);
  const [copied, copy] = useCopied();
  const [items, setItems] = useState(value.map(String));
  const [seen, setSeen] = useState(value);
  // The last list this sent: when it comes back saved, the items stay as typed (an empty one just added, say).
  const [sent, setSent] = useState<string | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  if (value !== seen) {
    setSeen(value);
    if (value.map(String).join("\n") !== sent) setItems(value.map(String));
  }
  // Saves as you type, 800ms after the last key; leaving the list saves at once.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const later = useRef<(() => void) | null>(null);
  const commit = (xs: string[]) => {
    clearTimeout(timer.current);
    later.current = null;
    const clean = xs.map((s) => s.trim()).filter(Boolean);
    const text = clean.join("\n");
    if (clean.length && text !== value.map(String).join("\n")) {
      setSent(text);
      onSave(clean.map(item));
    }
    return clean;
  };
  const change = (xs: string[]) => {
    setItems(xs);
    clearTimeout(timer.current);
    later.current = () => commit(xs);
    timer.current = setTimeout(() => later.current?.(), 800);
  };
  // A save still waiting goes out when the tab closes or the list leaves the page.
  useEffect(() => {
    const flush = () => later.current?.();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  // Esc: the blur it causes must not save the edit it is throwing away.
  const cancel = useRef(false);
  // Focus lands after the render that adds or removes the item, not on a timer.
  const pending = useRef<number | null>(null);
  const focusAt = (i: number) => (pending.current = i);
  useLayoutEffect(() => {
    if (pending.current === null) return;
    refs.current[pending.current]?.focus();
    pending.current = null;
  });

  return (
    <ul
      className={cn(
        look === "scale" ? cn("divide-y overflow-hidden rounded-xl border", fadeIn(face)) : look === "bullets" ? "space-y-0.5" : "space-y-1.5",
      )}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        if (cancel.current) {
          cancel.current = false;
          return setItems(value.map(String));
        }
        const clean = commit(items);
        if (clean.length) return setItems(clean);
        setItems(value.map(String));
        if (onEmpty) toast("A list needs an item", { action: { label: "Delete rule", onClick: onEmpty } });
      }}
    >
      {items.map((it, i) => {
        const size = Number(it);
        const sized = Number.isFinite(size) && size > 0;
        const sample = look === "scale" && (
          <span
            className="min-w-0 flex-1 truncate leading-tight"
            style={{ fontSize: sized ? `${Math.min(size, CAP)}px` : undefined, fontFamily: face ? stack(face) : undefined }}
            aria-hidden
          >
            {/* Small sizes are for reading, so they get a sentence to read. */}
            {sized && size <= 20 ? "The quick brown fox jumps over the lazy dog, and keeps going at this size." : "The quick brown fox"}
          </span>
        );
        // Read only, a scale row is a size to take away: a click copies "16px".
        if (readOnly && look === "scale")
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => void copy(`${it}px`, "size")}
                aria-label={`Copy ${it}px`}
                className="hover:bg-muted/40 active:bg-muted flex w-full items-center gap-4 px-3 py-2 text-start transition-colors"
              >
                <span className="grid w-14 shrink-0 font-mono text-xs tabular-nums">
                  <span className="flex items-center gap-1">
                    {it}px
                    {copied === `${it}px` && <IconCheck className="text-success animate-in zoom-in-50 size-3" />}
                  </span>
                  {sized && <span className="text-muted-foreground/70 text-2xs">{+(size / 16).toFixed(4)}rem</span>}
                  {size > CAP && <span className="text-muted-foreground text-2xs">shown at {CAP}px</span>}
                </span>
                {sample}
                <span className="sr-only" aria-live="polite">
                  {copied === `${it}px` ? "Copied" : ""}
                </span>
              </button>
            </li>
          );
        return (
          <li key={i} className={cn("flex items-center gap-2", look === "scale" ? "gap-4 px-3 py-2" : "text-base")}>
            {look !== "scale" && MARKER[look]}
            {readOnly ? (
              <span className="min-w-0 flex-1 px-1">{it}</span>
            ) : (
            <input
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={it}
              placeholder={look === "scale" ? "px" : "List item"}
              aria-label={`Item ${i + 1}`}
              inputMode={look === "scale" ? "decimal" : undefined}
              onChange={(e) => change(items.map((x, j) => (j === i ? e.target.value : x)))}
              // A pasted list is a list: one item a line, bullets and numbers dropped.
              onPaste={(e) => {
                const text = e.clipboardData.getData("text/plain");
                if (!/[\r\n]/.test(text)) return;
                e.preventDefault();
                const lines = text
                  .split(/\r?\n/)
                  .map((l) => l.replace(/^\s*(?:[-*•]\s*|\d+[.)]\s+)/, "").trim())
                  .filter(Boolean);
                if (!lines.length) return;
                // Into an empty item, they replace it; after one with text, they follow it.
                const at = it.trim() ? i + 1 : i;
                change([...items.slice(0, at), ...lines, ...items.slice(i + 1)]);
                focusAt(at + lines.length - 1);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setItems((xs) => [...xs.slice(0, i + 1), "", ...xs.slice(i + 1)]);
                  focusAt(i + 1);
                } else if (e.key === "Backspace" && it === "" && items.length > 1) {
                  e.preventDefault();
                  change(items.filter((_, j) => j !== i));
                  focusAt(Math.max(0, i - 1));
                } else if (e.key === "ArrowUp") {
                  refs.current[i - 1]?.focus();
                } else if (e.key === "ArrowDown") {
                  refs.current[i + 1]?.focus();
                } else if (e.key === "Escape") {
                  // Nothing typed since the last save goes out: not the waiting one, nor the blur's.
                  cancel.current = true;
                  clearTimeout(timer.current);
                  later.current = null;
                  setItems(value.map(String));
                  const el = e.currentTarget;
                  const block = el.closest<HTMLElement>("[data-block]");
                  if (block) block.focus();
                  else el.blur();
                }
              }}
              className={cn(
                "placeholder:text-muted-foreground/60 hover:bg-muted/60 focus-visible:bg-background focus-visible:ring-ring/40 rounded-md bg-transparent px-1 outline-none focus-visible:ring-2",
                look === "scale" ? "text-muted-foreground w-14 shrink-0 font-mono text-xs tabular-nums" : "min-w-0 flex-1",
              )}
            />
            )}
            {look === "scale" && size > CAP && <span className="text-muted-foreground text-2xs whitespace-nowrap">shown at {CAP}px</span>}
            {sample}
          </li>
        );
      })}
    </ul>
  );
}
