"use client";

import { useEffect, useId, useState } from "react";
import { IconAlertTriangle, IconCircleCheck, IconPalette } from "@tabler/icons-react";
import { Fold } from "@/components/fold";
import { LibraryPicker } from "@/components/asset-picker";
import { GRADE_STYLE } from "@/components/brand-values";
import { Thumb } from "@/components/thumb";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { z } from "zod";
import { LOOKS, type ThemePatch, type ThemeSettings } from "@/lib/brand-theme";
import { grade } from "@/lib/color";
import { fontValue, ruleName, type Rule } from "@/lib/rules";
import { send } from "@/lib/send";
import type { PageView } from "@/lib/site";
import { cn } from "@/lib/utils";

type Theme = PageView["theme"];
/** What PATCH /theme takes: a key left out keeps its value, null clears it back to the rules' answer. */
type Patch = z.output<typeof ThemePatch>;
/** What a slot is picked from: a rule as GET /brand/rules or a view gives it. */
type Choice = Pick<Rule, "key" | "label" | "context" | "type" | "value" | "assets">;

const AUTO = "*";
const COLORS = [
  ["accent", "Accent"],
  ["surface", "Page"],
  ["panel", "Panels"],
  ["dark", "Dark ground"],
  ["ink", "Text"],
  ["muted", "Quiet text"],
] as const;
const FONTS = [
  ["head", "Headings"],
  ["body", "Text"],
  ["label", "Labels"],
] as const;
const RADII = [0, 2, 4, 6, 8, 10, 12, 16, 24, 40];
const SCALES: [number, string][] = [
  [1.067, "minor second"],
  [1.125, "major second"],
  [1.2, "minor third"],
  [1.25, "major third"],
  [1.333, "perfect fourth"],
  [1.414, "augmented fourth"],
  [1.5, "perfect fifth"],
  [1.618, "golden ratio"],
];


/**
 * How a brand's pages look: which rule plays which part, and the page's
 * measure, rhythm and chrome. ThemePanel is it in a sheet, for the reader:
 * each change saves on its own (PATCH /theme, a draft in the history) and
 * `onSaved` has the host fetch its view again, so the page behind re-themes;
 * the contrast checks come back with it. The builder docks ThemeEditor beside
 * the canvas instead, which never covers the page: `onPatch` takes each
 * change (an undoable theme op, which re-themes the canvas at once), and
 * `rules` are the builder's, so nothing is fetched.
 */
export function ThemePanel({
  open,
  onOpenChange,
  ...props
}: Omit<ThemeEditorProps, "active"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <IconPalette className="size-5" /> Theme
          </SheetTitle>
          <SheetDescription>How the brand&apos;s pages look. Changes save as a draft until published.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ThemeEditor {...props} active={open} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export type ThemeEditorProps = {
  slug: string;
  theme: Theme;
  /** Shown now: rules are fetched when it opens, unless `rules` are given. */
  active: boolean;
  onSaved?: () => void;
  onPatch?: (patch: Patch) => void;
  /** Every rule, when the host has them; fetched on each open otherwise. */
  rules?: Choice[];
};

/**
 * The theme's settings, most used first: a style, the accent, the two faces,
 * the logo, the page's width, navigation and header. The rest (the other
 * colors, labels and scale, the device, density, corners, on this page,
 * dividers, numbering, motion, and each contrast pair) folds away under a
 * line that says what it is set to. "Automatic" is a part the rules decide.
 */
export function ThemeEditor({ slug, theme, active, onSaved, onPatch, rules: given }: ThemeEditorProps) {
  // The settings as last chosen, ahead of the view that confirms them.
  const [s, setS] = useState<Patch>(theme.settings);
  const [seen, setSeen] = useState(theme.settings);
  if (theme.settings !== seen) {
    setSeen(theme.settings);
    setS(theme.settings);
  }
  const [fetched, setRules] = useState<Choice[] | null>(null);
  const [picking, setPicking] = useState(false);
  // The theme reads the default context's.
  const rules = (given ?? fetched)?.filter((r) => r.context === null) ?? null;

  // Fetched on each open, since rules change elsewhere.
  useEffect(() => {
    if (!active || given) return;
    const ac = new AbortController();
    fetch(`/api/v1/brand/rules?brand=${encodeURIComponent(slug)}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j: { data: Rule[] }) => setRules(j.data))
      .catch(() => {
        if (!ac.signal.aborted) setRules([]);
      });
    return () => ac.abort();
  }, [active, slug, given]);

  const save = async (patch: Patch) => {
    // The builder's theme changes with the op, and `theme` with it; a refused op changes nothing.
    if (onPatch) return onPatch(patch);
    setS((p) => ({ ...p, ...patch }));
    if (await send("PATCH", `/api/v1/brands/${encodeURIComponent(slug)}/theme`, patch)) onSaved?.();
    else setS(theme.settings);
  };

  /** A slot's choices: the rules that can fill it, and the one named now even when it has gone. */
  const slot = (k: keyof Patch, fits: (r: Choice) => boolean, show: (r: Choice) => React.ReactNode) => {
    const named = s[k] as string | null | undefined;
    const fit = (rules ?? []).filter(fits);
    const options: [string, React.ReactNode][] = [[AUTO, "Automatic"], ...fit.map((r): [string, React.ReactNode] => [r.key, show(r)])];
    if (named && !fit.some((r) => r.key === named)) options.push([named, rules ? `${named} (missing)` : named]);
    return { value: named ?? AUTO, options, onChange: (v: string) => save({ [k]: v === AUTO ? null : v } as Patch) };
  };
  const color = (r: Choice) => (
    <>
      <Swatch hex={String(r.value)} />
      {ruleName(r)}
    </>
  );
  const font = (r: Choice) => (
    <>
      {ruleName(r)}
      <span className="text-muted-foreground">{fontValue(r.value).family}</span>
    </>
  );
  const colorPick = ([k, label]: (typeof COLORS)[number]) => <Pick key={k} label={label} hint={<Used hex={theme[k]} />} {...slot(k, (r) => r.type === "color", color)} />;
  const fontPick = ([k, label]: (typeof FONTS)[number]) => (
    <Pick key={k} label={label} hint={<span className="text-muted-foreground truncate text-xs">{theme.faces[k]?.family ?? "The app's"}</span>} {...slot(k, (r) => r.type === "font", font)} />
  );

  const failing = theme.checks.filter((c) => !c.ok).length;
  const radius = s.radius ?? theme.radius;
  const scale = s.scale ?? theme.scale;
  const byHand = COLORS.slice(1).filter(([k]) => s[k]).length;
  const scaleName = SCALES.find(([n]) => n === scale)?.[1] ?? String(scale);
  const words: Record<string, string> = { compact: "Compact", normal: "Normal", airy: "Airy", side: "beside", inline: "inline", none: "hidden" };

  return (
    <div className="grid min-w-0 grid-cols-1 content-start gap-6">
      <Group title="Style">
        <div className="grid grid-cols-1 gap-1.5">
          {Object.entries(LOOKS).map(([id, st]) => {
            const on = Object.entries(st.patch).every(([k, v]) => v === null || (s[k as keyof ThemeSettings] ?? theme[k as keyof typeof theme]) === v);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => save(st.patch)}
                className="hover:border-foreground/40 aria-pressed:border-foreground aria-pressed:bg-muted/50 focus-visible:ring-ring/50 flex min-w-0 items-baseline gap-2 rounded-lg border px-3 py-2 text-start outline-none transition-colors focus-visible:ring-3"
              >
                <span className="text-sm font-medium">{st.name}</span>
                <span className="text-muted-foreground min-w-0 truncate text-xs">{st.about}</span>
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Colors">
        {colorPick(COLORS[0])}
        <Fold bare title="More colors" summary={byHand ? `${byHand} set by hand` : "Automatic"}>
          {COLORS.slice(1).map(colorPick)}
          <Toggle
            label="Accent use"
            value={s.accentUse ?? theme.accentUse}
            options={[
              ["fill", "Fills"],
              ["hairline", "Hairlines"],
            ]}
            onChange={(v) => save({ accentUse: v as ThemeSettings["accentUse"] })}
          />
        </Fold>
      </Group>

      <Group title="Type">
        {FONTS.slice(0, 2).map(fontPick)}
        <Fold bare title="More type" summary={`Scale: ${scaleName}`}>
          {fontPick(FONTS[2])}
          <Pick
            label="Heading scale"
            value={String(scale)}
            options={withCurrent(
              SCALES.map(([n, name]) => [String(n), `${n}, ${name}`]),
              String(scale),
            )}
            onChange={(v) => save({ scale: Number(v) })}
          />
        </Fold>
      </Group>

      <Group title="Logo">
        <Pick label="Logo" {...slot("logo", (r) => r.assets.length > 0, (r) => ruleName(r))} />
        <Fold bare title="Device" summary={s.device ? "Set" : "None"}>
          <div className="grid gap-1.5">
            <p className="text-muted-foreground text-xs">The brand&apos;s symbol or pattern, for covers, dividers and pattern grounds.</p>
            <div className="flex items-center gap-2">
              {s.device && (
                <span className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-md border">
                  <Thumb src={`/a/${s.device}/w_160,f_webp`} alt="The device" />
                </span>
              )}
              <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
                {s.device ? "Replace" : "Choose"}
              </Button>
              {s.device && (
                <Button variant="ghost" size="sm" onClick={() => save({ device: null })}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        </Fold>
      </Group>

      <Group title="Layout">
        <Toggle
          label="Width"
          value={s.width ?? theme.width}
          options={[
            ["narrow", "Narrow"],
            ["normal", "Normal"],
            ["wide", "Wide"],
          ]}
          onChange={(v) => save({ width: v as ThemeSettings["width"] })}
        />
        <Toggle
          label="Navigation"
          value={s.nav ?? theme.nav}
          options={[
            ["sidebar", "Sidebar"],
            ["top", "Top"],
            ["overlay", "Overlay"],
          ]}
          onChange={(v) => save({ nav: v as ThemeSettings["nav"] })}
        />
        <Toggle
          label="Page header"
          value={theme.header}
          options={[
            ["plain", "Plain"],
            ["band", "Band"],
            ["split", "Beside cover"],
          ]}
          // header says it all: band, which says less, is cleared.
          onChange={(v) => save({ header: v as ThemeSettings["header"], band: null })}
        />
        <Fold
          bare
          title="More layout"
          summary={`${words[s.density ?? theme.density]}, ${radius}px corners, on this page ${words[s.toc ?? theme.toc]}`}
        >
          <Toggle
            label="Density"
            value={s.density ?? theme.density}
            options={[
              ["compact", "Compact"],
              ["normal", "Normal"],
              ["airy", "Airy"],
            ]}
            onChange={(v) => save({ density: v as ThemeSettings["density"] })}
          />
          <Pick
            label="Corner radius"
            value={String(radius)}
            options={withCurrent(
              RADII.map((n) => [String(n), `${n}px`]),
              String(radius),
            )}
            onChange={(v) => save({ radius: Number(v) })}
          />
          <Toggle
            label="On this page"
            value={s.toc ?? theme.toc}
            options={[
              ["side", "Side"],
              ["inline", "Inline"],
              ["none", "Hidden"],
            ]}
            onChange={(v) => save({ toc: v as ThemeSettings["toc"] })}
          />
          <Toggle
            label="Section titles"
            value={s.titles ?? theme.titles}
            options={[
              ["medium", "Headings"],
              ["large", "Large"],
              ["huge", "Headlines"],
            ]}
            onChange={(v) => save({ titles: v as ThemeSettings["titles"] })}
          />
          <On label="Alternate grounds down the page" checked={(s.grounds ?? theme.grounds) === "alternate"} onChange={(on) => save({ grounds: on ? "alternate" : "plain" })} />
          <Toggle
            label="Between sections"
            value={s.separation ?? theme.separation}
            options={[
              ["space", "Space"],
              ["hairline", "Hairline"],
            ]}
            onChange={(v) => save({ separation: v as ThemeSettings["separation"] })}
          />
          <On label="Number chapters and pages" checked={s.numbering ?? theme.numbering} onChange={(numbering) => save({ numbering })} />
          <On label="Reveal sections as they scroll in" checked={(s.motion ?? theme.motion) === "subtle"} onChange={(on) => save({ motion: on ? "subtle" : "none" })} />
        </Fold>
      </Group>

      <Group title="Contrast">
        <p className={cn("flex items-center gap-1.5 text-sm", failing ? "text-warning" : "text-muted-foreground")}>
          {failing ? <IconAlertTriangle aria-hidden className="size-4 shrink-0" /> : <IconCircleCheck aria-hidden className="text-success size-4 shrink-0" />}
          {failing ? `${failing} ${failing === 1 ? "pair falls" : "pairs fall"} short; the page uses a color that reads instead.` : "Every pair of text and ground reads."}
        </p>
        <Fold bare title="Every pair" summary={`${theme.checks.length} checked`}>
          <ul className="grid gap-2">
            {[...theme.checks]
              .sort((a, b) => Number(a.ok) - Number(b.ok))
              .map((c) => {
                const g = c.ok ? grade(c.ratio) : "fail";
                return (
                  <li key={c.pair} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="flex h-6 w-8 shrink-0 items-center justify-center rounded text-sm font-semibold ring-1 ring-black/10 dark:ring-white/10"
                      style={{ backgroundColor: c.bg, color: c.fg }}
                    >
                      Aa
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm first-letter:uppercase">{c.pair}</div>
                      {!c.ok && (
                        <div className="text-muted-foreground flex items-center gap-1 text-xs">
                          Needs {c.need}:1; uses <Swatch hex={c.used} /> <span className="font-mono">{c.used}</span>
                        </div>
                      )}
                    </div>
                    <span className="font-mono text-xs tabular-nums">{c.ratio.toFixed(1)}</span>
                    <span className={cn("rounded px-1.5 py-0.5 text-2xs font-semibold tracking-wide uppercase", GRADE_STYLE[g])}>{g}</span>
                  </li>
                );
              })}
          </ul>
        </Fold>
      </Group>

      {picking && (
        <LibraryPicker
          title="Choose the device"
          description="An image, ideally an SVG: the brand's symbol or pattern."
          filter={(a) => a.mime.startsWith("image/")}
          onClose={() => setPicking(false)}
          onPick={(a) => {
            setPicking(false);
            void save({ device: a.id });
          }}
        />
      )}
    </div>
  );
}

/** The options, and the value set now when it is none of them (set over the API, say). */
const withCurrent = (options: [string, string][], value: string) => (options.some(([v]) => v === value) ? options : [...options, [value, value] as [string, string]]);

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 grid-cols-1 gap-3">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  );
}

const Swatch = ({ hex }: { hex: string }) => (
  <span aria-hidden className="inline-block size-3 shrink-0 rounded-sm ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: hex }} />
);

/** The color the page uses for a part now, whoever chose it; none for a page on the app's ground. */
const Used = ({ hex }: { hex: string | null }) =>
  hex ? (
    <span className="text-muted-foreground flex items-center gap-1 font-mono text-xs">
      <Swatch hex={hex} />
      {hex}
    </span>
  ) : (
    <span className="text-muted-foreground text-xs">The app&apos;s</span>
  );

function Pick({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: React.ReactNode;
  value: string;
  options: [string, React.ReactNode][];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Label htmlFor={id} className="shrink-0">
          {label}
        </Label>
        {hint}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, node]) => (
            <SelectItem key={v} value={v}>
              {node}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Toggle({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <p id={id} className="text-sm font-medium">
        {label}
      </p>
      <ToggleGroup type="single" variant="outline" size="sm" value={value} onValueChange={(v) => v && v !== value && onChange(v)} aria-labelledby={id}>
        {options.map(([v, text]) => (
          <ToggleGroupItem key={v} value={v} className="px-3">
            {text}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function On({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="leading-snug font-normal">
        {label}
      </Label>
    </div>
  );
}
