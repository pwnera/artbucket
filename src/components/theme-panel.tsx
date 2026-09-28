"use client";

import { useEffect, useId, useState } from "react";
import { IconPalette } from "@tabler/icons-react";
import { LibraryPicker } from "@/components/asset-picker";
import { GRADE_STYLE } from "@/components/brand-values";
import { Thumb } from "@/components/thumb";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ThemeSettings } from "@/lib/brand-theme";
import { grade } from "@/lib/color";
import { fontValue, ruleName, type Rule } from "@/lib/rules";
import { send } from "@/lib/send";
import type { PageView } from "@/lib/site";
import { cn } from "@/lib/utils";

type Theme = PageView["theme"];
/** What PATCH /theme takes: a key left out keeps its value, null clears it back to the rules' answer. */
type Patch = { [K in keyof ThemeSettings]?: ThemeSettings[K] | null };

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
 * measure, rhythm and chrome. Each change saves on its own (PATCH /theme, a
 * draft in the history) and `onSaved` has the host fetch its view again, so
 * the page behind re-themes; the contrast checks come back with it.
 */
export function ThemePanel({
  slug,
  theme,
  open,
  onOpenChange,
  onSaved,
}: {
  slug: string;
  theme: Theme;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  // The settings as last chosen, ahead of the view that confirms them.
  const [s, setS] = useState<Patch>(theme.settings);
  const [seen, setSeen] = useState(theme.settings);
  if (theme.settings !== seen) {
    setSeen(theme.settings);
    setS(theme.settings);
  }
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [picking, setPicking] = useState(false);

  // Fetched on each open, since rules change elsewhere; the theme reads the default context's.
  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    fetch(`/api/v1/brand/rules?brand=${encodeURIComponent(slug)}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j: { data: Rule[] }) => setRules(j.data.filter((r) => r.context === null)))
      .catch(() => {
        if (!ac.signal.aborted) setRules([]);
      });
    return () => ac.abort();
  }, [open, slug]);

  const save = async (patch: Patch) => {
    setS((p) => ({ ...p, ...patch }));
    if (await send("PATCH", `/api/v1/brands/${encodeURIComponent(slug)}/theme`, patch)) onSaved();
    else setS(theme.settings);
  };

  /** A slot's choices: the rules that can fill it, and the one named now even when it has gone. */
  const slot = (k: keyof Patch, fits: (r: Rule) => boolean, show: (r: Rule) => React.ReactNode) => {
    const named = s[k] as string | null | undefined;
    const fit = (rules ?? []).filter(fits);
    const options: [string, React.ReactNode][] = [[AUTO, "From the rules"], ...fit.map((r): [string, React.ReactNode] => [r.key, show(r)])];
    if (named && !fit.some((r) => r.key === named)) options.push([named, rules ? `${named} (missing)` : named]);
    return { value: named ?? AUTO, options, onChange: (v: string) => save({ [k]: v === AUTO ? null : v } as Patch) };
  };
  const color = (r: Rule) => (
    <>
      <Swatch hex={String(r.value)} />
      {ruleName(r)}
    </>
  );
  const font = (r: Rule) => (
    <>
      {ruleName(r)}
      <span className="text-muted-foreground">{fontValue(r.value).family}</span>
    </>
  );

  const failing = theme.checks.filter((c) => !c.ok).length;
  const radius = s.radius ?? theme.radius;
  const scale = s.scale ?? theme.scale;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <IconPalette className="size-5" /> Theme
          </SheetTitle>
          <SheetDescription>
            How the brand&apos;s pages look. Each part left to the rules follows them; changes save as a draft until published.
          </SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto p-4">
          <Group title="Colors">
            {COLORS.map(([k, label]) => (
              <Pick key={k} label={label} hint={<Used hex={theme[k]} />} {...slot(k, (r) => r.type === "color", color)} />
            ))}
            <Toggle
              label="Accent use"
              value={s.accentUse ?? theme.accentUse}
              options={[
                ["fill", "Fills"],
                ["hairline", "Hairlines"],
              ]}
              onChange={(v) => save({ accentUse: v as ThemeSettings["accentUse"] })}
            />
          </Group>

          <Group title="Type">
            {FONTS.map(([k, label]) => (
              <Pick
                key={k}
                label={label}
                hint={<span className="text-muted-foreground truncate text-xs">{theme.faces[k]?.family}</span>}
                {...slot(k, (r) => r.type === "font", font)}
              />
            ))}
            <Pick
              label="Heading scale"
              value={String(scale)}
              options={withCurrent(
                SCALES.map(([n, name]) => [String(n), `${n}, ${name}`]),
                String(scale),
              )}
              onChange={(v) => save({ scale: Number(v) })}
            />
          </Group>

          <Group title="Logo and device">
            <Pick label="Logo" {...slot("logo", (r) => r.assets.length > 0, (r) => ruleName(r))} />
            <div className="grid gap-1.5">
              <p className="text-sm font-medium">Device</p>
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
          </Group>

          <Group title="Layout">
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
              label="Density"
              value={s.density ?? theme.density}
              options={[
                ["compact", "Compact"],
                ["normal", "Normal"],
                ["airy", "Airy"],
              ]}
              onChange={(v) => save({ density: v as ThemeSettings["density"] })}
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
            <On label="Open every page on a band of the brand color" checked={s.band ?? theme.band} onChange={(band) => save({ band })} />
            <On label="Number chapters and pages" checked={s.numbering ?? theme.numbering} onChange={(numbering) => save({ numbering })} />
            <On
              label="Reveal sections as they scroll in"
              checked={(s.motion ?? theme.motion) === "subtle"}
              onChange={(on) => save({ motion: on ? "subtle" : "none" })}
            />
          </Group>

          <Group title="Contrast">
            <p className="text-muted-foreground text-xs">
              {failing
                ? `${failing} ${failing === 1 ? "pair falls" : "pairs fall"} short; the page uses a color that reads instead.`
                : "Every pair reads."}
            </p>
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
          </Group>
        </div>

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
      </SheetContent>
    </Sheet>
  );
}

/** The options, and the value set now when it is none of them (set over the API, say). */
const withCurrent = (options: [string, string][], value: string) => (options.some(([v]) => v === value) ? options : [...options, [value, value] as [string, string]]);

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
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
    <div className="grid gap-1.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
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
