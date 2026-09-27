"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { IconCheck, IconCopy, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import { useAssetFont } from "@/components/font-preview";
import { contrast, grade, hsl, inkOn, rgb } from "@/lib/color";
import { fontStyle, isFont, pickFace, weightName } from "@/lib/font";
import { fontValue, listStyle, section, type FontValue, type ListStyle, type Rule, type RuleAsset, type RuleValue } from "@/lib/rules";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * How each kind of rule looks, and how it is edited in place: the two are the
 * same element. A color is a swatch with its readouts and contrast; a type
 * scale is a specimen; a don't list is crossed out in red.
 */
export function ValueEditor({
  rule: r,
  autoFocus,
  onSave,
}: {
  rule: Rule;
  autoFocus: boolean;
  onSave: (v: RuleValue) => void;
}) {
  switch (r.type) {
    case "color":
      return <ColorEditor value={r.value as string} autoFocus={autoFocus} onSave={onSave} />;
    case "font":
      return <FontEditor rule={r} autoFocus={autoFocus} onSave={onSave} />;
    case "list": {
      const value = r.value as (string | number)[];
      const look = listStyle(r.key, value);
      const set = look === "scale" ? pickFace(fontFiles(r))?.id : undefined;
      return <ListEditor value={value} look={look} fontId={set} autoFocus={autoFocus} onSave={onSave} />;
    }
    case "number":
      return (
        <Editable
          value={String(r.value)}
          autoFocus={autoFocus}
          inputMode="decimal"
          className="font-mono text-3xl font-medium tracking-tight tabular-nums"
          onSave={(v) => (Number.isFinite(Number(v)) && v !== "" ? onSave(Number(v)) : toast.error("Not a number"))}
        />
      );
    default:
      return <TextEditor rule={r} autoFocus={autoFocus} onSave={onSave} />;
  }
}

/** A sentence, set in the font the rule was given (see SetIn), if any. */
function TextEditor({ rule: r, autoFocus, onSave }: { rule: Rule; autoFocus: boolean; onSave: (v: RuleValue) => void }) {
  const text = r.value as string;
  const set = useAssetFont(pickFace(fontFiles(r))?.id);
  // A text rule naming a typeface shows the face, where the browser has it.
  const face = section(r.key) === "type" && /font|family|face/i.test(r.key.split(".").pop()!);
  return (
    <div className="space-y-2">
      <Editable
        value={text}
        autoFocus={autoFocus}
        multiline
        className={cn("text-base leading-relaxed", section(r.key) === "tone" && "text-lg")}
        style={set ? { fontFamily: stack(set) } : undefined}
        onSave={(v) => v && onSave(v)}
      />
      {face && (
        <p className="truncate text-4xl leading-tight" style={{ fontFamily: text }} aria-hidden>
          Aa Bb Cc 0123
        </p>
      )}
    </div>
  );
}

export const isFontAsset = (a: RuleAsset) => !!a.mime && isFont(a.mime, a.filename ?? "");
/** The rule's font files, in order. */
export const fontFiles = (r: Rule) => r.assets.filter(isFontAsset);

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

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
function FontEditor({ rule: r, autoFocus, onSave }: { rule: Rule; autoFocus: boolean; onSave: (v: RuleValue) => void }) {
  const v = fontValue(r.value);
  const files = fontFiles(r);
  const face = useAssetFont(pickFace(files, v.weight)?.id);
  const weights = files.length
    ? [...new Set(files.map((f) => fontStyle(f.filename ?? "")).filter((s) => !s.italic).map((s) => s.weight))].sort((a, b) => a - b)
    : WEIGHTS;
  // Unset fields are left out, not stored as null: the value stays { family } until someone sizes it.
  const save = (patch: Partial<FontValue>) => {
    const next = { ...v, ...patch };
    onSave(Object.fromEntries(Object.entries(next).filter(([, x]) => x !== undefined)) as FontValue);
  };
  return (
    <div className="space-y-2">
      <Editable value={v.family} autoFocus={autoFocus} label="Family" className="text-base font-medium" onSave={(f) => f && save({ family: f })} />
      <p
        className="truncate leading-tight"
        style={{ fontFamily: stack(face, v.family), fontSize: `${Math.min(v.size ?? 48, 96)}px`, fontWeight: v.weight }}
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
              else toast.error("Not a size");
            }}
          />
          px
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
    </div>
  );
}

export const copy = (text: string, what: string) =>
  navigator.clipboard.writeText(text).then(
    () => toast.success(`Copied ${what}`),
    () => toast.error("Couldn't copy"),
  );

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
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  className?: string;
  inputMode?: "decimal";
  label?: string;
  style?: React.CSSProperties;
}) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  return (
    <textarea
      rows={1}
      value={text}
      placeholder={placeholder}
      aria-label={label ?? placeholder}
      inputMode={inputMode}
      spellCheck={multiline}
      autoFocus={autoFocus}
      onFocus={(e) => autoFocus && e.currentTarget.select()}
      onChange={(e) => setText(multiline ? e.target.value : e.target.value.replace(/\n/g, ""))}
      onBlur={() => {
        const next = text.trim();
        if (next !== value) onSave(next);
        setText(next || value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !(multiline && e.shiftKey)) {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setText(value);
          // Blur after the reset lands, so it doesn't save the old text.
          const el = e.currentTarget;
          setTimeout(() => el.blur());
        }
      }}
      className={cn(
        "placeholder:text-muted-foreground/60 hover:bg-muted/60 focus-visible:bg-background focus-visible:ring-ring/40 -mx-1 block w-[calc(100%+0.5rem)] resize-none rounded-md bg-transparent px-1 outline-none field-sizing-content focus-visible:ring-2",
        className,
      )}
      style={style}
    />
  );
}

const GRADE_STYLE: Record<ReturnType<typeof grade>, string> = {
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
      <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase", GRADE_STYLE[g])}>
        {g}
      </span>
    </div>
  );
}

/**
 * The swatch is the native color picker; the hex beside it is editable text;
 * the readouts copy on click; contrast is graded against WCAG 2.
 */
function ColorEditor({ value, autoFocus, onSave }: { value: string; autoFocus: boolean; onSave: (v: string) => void }) {
  const [live, setLive] = useState(value);
  const [seen, setSeen] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  if (value !== seen) {
    setSeen(value);
    setLive(value);
  }
  const valid = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(live);
  const hex = valid ? live.slice(0, 7) : "#000000";
  const [r, g, b] = rgb(hex);
  const [h, s, l] = hsl([r, g, b]);
  const readouts = [
    ["RGB", `rgb(${r} ${g} ${b})`],
    ["HSL", `hsl(${h} ${s}% ${l}%)`],
  ];

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <label
        className="focus-within:ring-ring/50 relative flex h-32 shrink-0 cursor-pointer flex-col justify-between rounded-xl p-3 shadow-sm ring-1 ring-black/10 transition-shadow focus-within:ring-2 hover:shadow-md sm:w-48 dark:ring-white/10"
        style={{ backgroundColor: live, color: inkOn(hex) }}
      >
        <span className="text-3xl font-semibold tracking-tight">Aa</span>
        <span className="font-mono text-xs opacity-80">{live}</span>
        <span className="sr-only">Pick a color</span>
        <input
          type="color"
          value={hex}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          onChange={(e) => {
            const v = e.target.value;
            setLive(v);
            // The picker streams values while you drag; save where it stops.
            clearTimeout(timer.current);
            timer.current = setTimeout(() => onSave(v), 400);
          }}
        />
      </label>

      <div className="grid min-w-0 flex-1 content-start gap-2 text-sm">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground w-9 text-xs font-medium">HEX</span>
          <Editable
            value={live}
            label="Hex value"
            autoFocus={autoFocus}
            className="w-40 font-mono text-sm"
            onSave={(v) => onSave(v.toLowerCase())}
          />
          <CopyButton onClick={() => copy(live, live)} label="Copy hex" />
        </div>
        {readouts.map(([k, v]) => (
          <div key={k} className="flex items-center gap-3">
            <span className="text-muted-foreground w-9 text-xs font-medium">{k}</span>
            <code className="w-40 truncate font-mono text-sm">{v}</code>
            <CopyButton onClick={() => copy(v, v)} label={`Copy ${k}`} />
          </div>
        ))}
        {valid && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Contrast hex={hex} on="#ffffff" />
            <Contrast hex={hex} on="#000000" />
          </div>
        )}
      </div>
    </div>
  );
}

export function CopyButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1 transition-colors"
    >
      <IconCopy className="size-4" />
    </button>
  );
}

/** Numbers stay numbers, so a type scale reads back as 12, 14, 16. */
const item = (s: string) => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s);

const MARKER: Record<Exclude<ListStyle, "scale">, React.ReactNode> = {
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
  autoFocus,
  onSave,
}: {
  value: (string | number)[];
  look: ListStyle;
  /** A scale's specimen is set in this font file, when the scale names one. */
  fontId?: string;
  autoFocus: boolean;
  onSave: (v: (string | number)[]) => void;
}) {
  const face = useAssetFont(fontId);
  const [items, setItems] = useState(value.map(String));
  const [seen, setSeen] = useState(value);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  if (value !== seen) {
    setSeen(value);
    setItems(value.map(String));
  }
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
      className={cn(look === "scale" ? "divide-y rounded-xl border" : look === "bullets" ? "space-y-0.5" : "space-y-1.5")}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        const clean = items.map((s) => s.trim()).filter(Boolean);
        if (!clean.length) return setItems(value.map(String));
        if (clean.join("\n") !== value.map(String).join("\n")) onSave(clean.map(item));
        setItems(clean);
      }}
    >
      {items.map((it, i) => {
        const size = Number(it);
        return (
          <li key={i} className={cn("flex items-center gap-2", look === "scale" ? "gap-4 px-3 py-2" : "text-sm")}>
            {look !== "scale" && MARKER[look]}
            <input
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={it}
              autoFocus={autoFocus && i === 0}
              onFocus={(e) => autoFocus && i === 0 && e.currentTarget.select()}
              placeholder={look === "scale" ? "px" : "List item"}
              aria-label={`Item ${i + 1}`}
              inputMode={look === "scale" ? "decimal" : undefined}
              onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setItems((xs) => [...xs.slice(0, i + 1), "", ...xs.slice(i + 1)]);
                  focusAt(i + 1);
                } else if (e.key === "Backspace" && it === "" && items.length > 1) {
                  e.preventDefault();
                  setItems((xs) => xs.filter((_, j) => j !== i));
                  focusAt(Math.max(0, i - 1));
                } else if (e.key === "ArrowUp") {
                  refs.current[i - 1]?.focus();
                } else if (e.key === "ArrowDown") {
                  refs.current[i + 1]?.focus();
                } else if (e.key === "Escape") {
                  setItems(value.map(String));
                  e.currentTarget.blur();
                }
              }}
              className={cn(
                "placeholder:text-muted-foreground/60 hover:bg-muted/60 focus-visible:bg-background focus-visible:ring-ring/40 rounded-md bg-transparent px-1 outline-none focus-visible:ring-2",
                look === "scale" ? "text-muted-foreground w-14 shrink-0 font-mono text-xs tabular-nums" : "min-w-0 flex-1",
              )}
            />
            {look === "scale" && (
              <span
                className="min-w-0 flex-1 truncate leading-tight"
                style={{
                  fontSize: Number.isFinite(size) && size > 0 ? `${Math.min(size, 96)}px` : undefined,
                  fontFamily: face ? stack(face) : undefined,
                }}
                aria-hidden
              >
                The quick brown fox
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
