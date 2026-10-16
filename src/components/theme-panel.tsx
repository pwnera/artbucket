"use client";

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { IconAlertTriangle, IconCircleCheck, IconPalette, IconPlus, IconTrash } from "@/components/icons";
import { Fold } from "@/components/fold";
import { IconButton } from "@/components/icon-button";
import { SiteLinkIcon } from "@/components/site/link-icon";
import { LibraryPicker } from "@/components/asset-picker";
import { ColorField } from "@/components/color-field";
import { GoogleFontImport } from "@/components/font-preview";
import { GRADE_STYLE } from "@/components/brand-values";
import { Thumb } from "@/components/thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { z } from "zod";
import { LOOKS, type ThemePatch, type ThemeSettings } from "@/lib/brand-theme";
import { grade } from "@/lib/color";
import { keyFor } from "@/lib/presets";
import { fontValue, ruleName, type Rule } from "@/lib/rules";
import { send } from "@/lib/send";
import type { PageView } from "@/lib/site";
import { cn } from "@/lib/utils";

type Theme = PageView["theme"];
/** What PATCH /theme takes: a key left out keeps its value, null clears it back to the rules' answer. */
type Patch = z.output<typeof ThemePatch>;
/** What a slot is picked from: a rule as GET /brand/rules or a view gives it. */
type Choice = Pick<Rule, "id" | "key" | "label" | "context" | "type" | "value" | "assets">;
/** What a slot's own editor changes on the rule behind it: its value, its files. */
type RuleChange = { value?: Rule["value"]; assets?: { id: string; rendition: string | null }[] };

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
          <SheetDescription>Saved as a draft until released.</SheetDescription>
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
  const [picking, setPicking] = useState<"device" | "logo" | "fontFile" | null>(null);
  const [fontFor, setFontFor] = useState<(typeof FONTS)[number][0] | null>(null);
  const [fileFor, setFileFor] = useState<(typeof FONTS)[number][0] | null>(null);
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

  /**
   * The rule that fills a slot now: the one named, else the one the theme
   * picked by itself, found by its key (the logo) or by what it holds.
   */
  const filling = (k: (typeof COLORS)[number][0] | (typeof FONTS)[number][0] | "logo"): Choice | null => {
    const named = s[k] as string | null | undefined;
    if (named) return rules?.find((r) => r.key === named) ?? null;
    if (k === "logo") return rules?.find((r) => r.key === theme.logo?.key) ?? null;
    if (k === "head" || k === "body" || k === "label") return rules?.find((r) => r.type === "font" && fontValue(r.value).family === theme.faces[k]?.family) ?? null;
    const used = theme[k]?.toLowerCase();
    return rules?.find((r) => r.type === "color" && String(r.value).toLowerCase() === used) ?? null;
  };

  /**
   * Change the rule behind a slot (decision: one source, which tokens and
   * BrandHub read too): its value or files, a draft like any edit on Rules.
   * A slot nothing fills yet gets a rule of its own, named for it, and is
   * set to it. The page behind re-themes with the view (`onSaved`).
   */
  const writeRule = async (k: keyof Patch, r: Choice | null, change: RuleChange, make: { section: string; name: string; type: Rule["type"]; value: Rule["value"] }) => {
    if (r) {
      held(k, r, change);
      if (!(await send("PATCH", `/api/v1/brand/rules/${r.id}`, change))) return;
    } else {
      const key = keyFor(make.section, make.name, new Set((rules ?? []).map((x) => x.key)));
      const made = key && ((await send("POST", `/api/v1/brand/rules?brand=${encodeURIComponent(slug)}`, { key, label: make.name, type: make.type, value: make.value, ...change })) as Choice | null);
      if (!made) return;
      setRules((rs) => [...(rs ?? []), made]);
      await save({ [k]: made.key } as Patch);
    }
    onSaved?.();
  };
  /**
   * Shown at once: the rule's new value or files, and an Automatic slot named
   * for the rule it showed, so it stays on that rule while its value moves.
   */
  const held = (k: keyof Patch, r: Choice, change: RuleChange) => {
    setRules((rs) => rs && rs.map((x) => (x.id === r.id ? ({ ...x, ...change } as Choice) : x)));
    if (!s[k]) void save({ [k]: r.key } as Patch);
  };
  // A color picker moves the value as it is dragged: the rule is written once it rests.
  const resting = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const later = (k: string, fn: () => void) => {
    clearTimeout(resting.current[k]);
    resting.current[k] = setTimeout(fn, 400);
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
  // Each slot edits its value in place, on the rule behind it; which rule fills it is the select's, a second choice.
  const colorPick = ([k, label]: (typeof COLORS)[number]) => {
    const r = filling(k);
    const hex = String(r?.value ?? theme[k] ?? "#888888");
    return (
      <Pick key={k} label={label} hint={<Used hex={theme[k]} />} {...slot(k, (x) => x.type === "color", color)}>
        <ColorField
          label={`${label} color`}
          value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#888888"}
          onChange={(v) => {
            if (r) held(k, r, { value: v });
            later(k, () => void writeRule(k, r, { value: v }, { section: "color", name: label, type: "color", value: v }));
          }}
        />
      </Pick>
    );
  };
  const fontPick = ([k, label]: (typeof FONTS)[number]) => {
    return (
      <Pick key={k} label={label} hint={<span className="text-muted-foreground truncate text-xs">{theme.faces[k]?.family ?? "The app's"}</span>} {...slot(k, (x) => x.type === "font", font)}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setFontFor(k)}>
            Change font
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setFileFor(k)}>
            Add font files
          </Button>
        </div>
      </Pick>
    );
  };
  const logo = filling("logo");

  // The look whose every setting is the theme's now; none when one was changed by hand.
  const look =
    Object.entries(LOOKS).find(([, st]) => Object.entries(st.patch).every(([k, v]) => v === null || (s[k as keyof ThemeSettings] ?? theme[k as keyof typeof theme]) === v))?.[0] ?? "";
  const failing = theme.checks.filter((c) => !c.ok).length;
  const radius = s.radius ?? theme.radius;
  const scale = s.scale ?? theme.scale;
  const byHand = COLORS.slice(1).filter(([k]) => s[k]).length;
  const scaleName = SCALES.find(([n]) => n === scale)?.[1] ?? String(scale);
  const words: Record<string, string> = { compact: "Compact", normal: "Normal", airy: "Airy", side: "beside", inline: "inline", none: "hidden" };

  return (
    <div className="grid min-w-0 grid-cols-1 content-start gap-6">
      <Group title="Style">
        <div className="@container">
          {/* One look of several, the cards one stop: arrows move between them, Enter or Space picks (and saves) one. */}
          <ToggleGroup
            type="single"
            spacing={2}
            value={look}
            onValueChange={(id) => id && save(LOOKS[id].patch)}
            aria-label="Style"
            className="grid w-full grid-cols-2 items-stretch @md:grid-cols-3"
          >
            {Object.entries(LOOKS).map(([id, st]) => (
              <ToggleGroupItem
                key={id}
                value={id}
                className="text-foreground hover:border-foreground/40 data-[state=on]:border-foreground data-[state=on]:bg-muted/50 dark:data-[state=on]:bg-muted/50 data-[state=on]:text-foreground focus-visible:ring-ring/50 grid h-auto min-w-0 content-start justify-stretch gap-2 rounded-lg border p-2 text-start font-normal whitespace-normal outline-none hover:bg-transparent focus-visible:ring-3"
              >
                <LookSketch look={st.patch} />
                <span className="grid gap-0.5 px-0.5">
                  <span className="text-sm font-medium">{st.name}</span>
                  <span className="text-muted-foreground line-clamp-2 text-xs">{st.about}</span>
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
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
        <Pick label="Logo" {...slot("logo", (r) => r.assets.length > 0, (r) => ruleName(r))}>
          <div className="flex items-center gap-2">
            {logo?.assets[0] && (
              <span className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-md border">
                <Thumb src={`/a/${logo.assets[0].id}/w_160,f_webp`} alt="The logo" />
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => setPicking("logo")}>
              {logo?.assets[0] ? "Replace" : "Choose"}
            </Button>
          </div>
        </Pick>
        <Fold bare title="Device" summary={s.device ? "Set" : "None"}>
          <div className="grid gap-1.5">
            <p className="text-muted-foreground text-xs">Symbol or pattern, for covers, dividers and grounds.</p>
            <div className="flex items-center gap-2">
              {s.device && (
                <span className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-md border">
                  <Thumb src={`/a/${s.device}/w_160,f_webp`} alt="The device" />
                </span>
              )}
              <Button variant="outline" size="sm" onClick={() => setPicking("device")}>
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

      <Group title="Links">
        <LinksEditor links={s.links ?? []} onSave={(links) => save({ links: links.length ? links : null })} />
      </Group>

      <Group title="Contrast">
        <p className={cn("flex items-center gap-1.5 text-sm", failing ? "text-warning" : "text-muted-foreground")}>
          {failing ? <IconAlertTriangle aria-hidden className="size-4 shrink-0" /> : <IconCircleCheck aria-hidden className="text-success size-4 shrink-0" />}
          {failing ? `${failing} ${failing === 1 ? "pair falls" : "pairs fall"} short; a color that reads stands in.` : "Every pair of text and ground reads."}
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

      {picking === "device" && (
        <LibraryPicker
          title="Choose the device"
          description="An image, ideally an SVG: the brand's symbol or pattern."
          filter={(a) => a.mime.startsWith("image/")}
          onClose={() => setPicking(null)}
          onPick={(a) => {
            setPicking(null);
            void save({ device: a.id });
          }}
        />
      )}
      {picking === "logo" && (
        <LibraryPicker
          title="Choose the logo"
          description="The approved file, ideally an SVG: it goes first on the logo rule."
          filter={(a) => a.mime.startsWith("image/")}
          onClose={() => setPicking(null)}
          onPick={(a) => {
            setPicking(null);
            const files = [{ id: a.id, rendition: null }, ...(logo?.assets ?? []).filter((x) => x.id !== a.id).map((x) => ({ id: x.id, rendition: x.rendition }))];
            void writeRule("logo", logo, { assets: files }, { section: "logo", name: "Primary", type: "text", value: "The approved logo" });
          }}
        />
      )}
      {/* A face from Google Fonts: its files land in the library and on the rule, its name in the rule's value. */}
      <GoogleFontImport
        open={!!fontFor}
        onOpenChange={(o) => !o && setFontFor(null)}
        onDone={(ids, family) => {
          const k = fontFor!;
          const r = filling(k);
          setFontFor(null);
          const value = { ...fontValue(r?.value ?? family), family };
          void writeRule(k, r, { value, assets: ids.map((id) => ({ id, rendition: null })) }, { section: "type", name: FONTS.find(([x]) => x === k)![1], type: "font", value });
        }}
      />
      {fileFor && (
        <LibraryPicker
          title="Add a font file"
          description="A file the brand owns, uploaded to the library: the pages load it for this face."
          filter={(a) => a.mime.startsWith("font/") || /\.(woff2?|[ot]tf)$/i.test(a.filename)}
          onClose={() => setFileFor(null)}
          onPick={(a) => {
            const k = fileFor;
            const r = filling(k);
            setFileFor(null);
            if (!r) return void toast.error("Pick or change the font first", { description: "The file goes on the rule that names the face." });
            void writeRule(k, r, { assets: [...r.assets.map((x) => ({ id: x.id, rendition: x.rendition })), { id: a.id, rendition: null }] }, { section: "type", name: "", type: "font", value: "" });
          }}
        />
      )}
    </div>
  );
}

/** The options, and the value set now when it is none of them (set over the API, say). */
const withCurrent = (options: [string, string][], value: string) => (options.some(([v]) => v === value) ? options : [...options, [value, value] as [string, string]]);

/** A group of settings, named by its heading: Colors' Text and Type's Text are told apart by it. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid min-w-0 grid-cols-1 gap-3">
      <h3 id={id} className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {title}
      </h3>
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

/** A slot: which rule fills it, and under it (`children`) its value, edited in place on that rule. */
function Pick({
  label,
  hint,
  value,
  options,
  onChange,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  value: string;
  options: [string, React.ReactNode][];
  onChange: (v: string) => void;
  children?: React.ReactNode;
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
      {children}
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

type Link = NonNullable<ThemeSettings["links"]>[number];
const MAX_LINKS = 8;
const isWeb = (url: string) => {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

/**
 * The links beside search and print on the brand's pages (its repository,
 * its Figma library): a row each, saved when the row is left, once both are
 * filled and the address is http or https. A half-filled row waits.
 */
function LinksEditor({ links, onSave }: { links: Link[]; onSave: (links: Link[]) => void }) {
  const [rows, setRows] = useState<Link[]>(links);
  const [seen, setSeen] = useState(links);
  const done = (r: Link) => !!r.label.trim() && isWeb(r.url.trim());
  // Saved (or undone): the saved links, and the rows still being filled in after them.
  if (links !== seen) {
    setSeen(links);
    setRows([...links, ...rows.filter((r) => !done(r))]);
  }
  const commit = (next: Link[]) => {
    const kept = next.filter(done).map((r) => ({ label: r.label.trim(), url: r.url.trim() }));
    if (JSON.stringify(kept) !== JSON.stringify(links)) onSave(kept);
  };
  const edit = (i: number, part: Partial<Link>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...part } : r)));
  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-xs">Beside search and print: its repository, its Figma library, its site.</p>
      {rows.map((r, i) => {
        const bad = !!r.url.trim() && !isWeb(r.url.trim());
        return (
          <div key={i} className="flex min-w-0 items-center gap-1.5" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && commit(rows)}>
            <SiteLinkIcon url={r.url} className="text-muted-foreground size-4 shrink-0" />
            <Input aria-label="Label" placeholder="GitHub" maxLength={40} value={r.label} onChange={(e) => edit(i, { label: e.target.value })} className="h-8 w-24 shrink-0" />
            <Input
              aria-label="Address"
              aria-invalid={bad || undefined}
              type="url"
              inputMode="url"
              placeholder="https://"
              maxLength={2000}
              value={r.url}
              onChange={(e) => edit(i, { url: e.target.value })}
              className="h-8 min-w-0 flex-1"
            />
            <IconButton
              label="Remove the link"
              variant="ghost"
              onClick={() => {
                const next = rows.filter((_, j) => j !== i);
                setRows(next);
                commit(next);
              }}
            >
              <IconTrash aria-hidden />
            </IconButton>
          </div>
        );
      })}
      {rows.length < MAX_LINKS && (
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setRows((rs) => [...rs, { label: "", url: "" }])}>
          <IconPlus aria-hidden /> Add a link
        </Button>
      )}
    </div>
  );
}

/**
 * A look drawn as a small page, gray like a loading skeleton: where its
 * navigation sits, how its header opens, how wide and dense it reads, how big
 * its titles are, its corners, grounds and contents. What picking it gives.
 */
function LookSketch({ look }: { look: (typeof LOOKS)[string]["patch"] }) {
  const W = 120;
  const H = 80;
  const side = look.nav === "sidebar" ? 26 : 0;
  const area = W - side;
  const w = area * { narrow: 0.6, normal: 0.78, wide: 0.88 }[look.width ?? "normal"];
  const x = side + (area - w) / 2;
  const toc = look.toc === "side" ? 16 : 0;
  const cw = w - toc;
  const r = Math.min((look.radius ?? 8) / 4, 4);
  const gap = { compact: 3, normal: 4, airy: 6 }[look.density ?? "normal"];
  const th = { medium: 3, large: 4.5, huge: 6.5 }[look.titles ?? "large"];
  const back: React.ReactNode[] = [];
  const front: React.ReactNode[] = [];
  const bar = (bx: number, by: number, bw: number, bh: number, cls: string, rx = Math.min(bh / 2, 1.5)) =>
    front.push(<rect key={front.length} x={bx} y={by} width={bw} height={bh} rx={rx} className={cls} />);

  // Navigation: a column, a bar along the top, or a menu button over the page.
  if (side) {
    back.push(<rect key="side" width={side} height={H} className="fill-foreground/[0.06]" />);
    bar(6, 8, 10, 3, "fill-foreground/30");
    [17, 23, 29].forEach((by, i) => bar(6, by, i === 1 ? 10 : 14, 2, "fill-foreground/15"));
  } else {
    bar(x, 7, 12, 3, "fill-foreground/30");
    if (look.nav === "top") [0, 1, 2].forEach((i) => bar(x + w - 8 - i * 11, 7.5, 8, 2, "fill-foreground/15"));
    else [7, 10].forEach((by) => bar(x + w - 6, by, 6, 1.2, "fill-foreground/30", 0.6));
  }

  // The header: plain, beside a picture, or on a band of the brand's color.
  let y = side ? 9 : 20;
  const top = y;
  if (look.header === "band") {
    back.push(<rect key="band" x={side} y={y - 3} width={area} height={th + 16} className="fill-foreground/15" />);
    bar(x, y + 4, cw * 0.55, th, "fill-background");
    bar(x, y + 7 + th, cw * 0.32, 2, "fill-background/60");
    y += th + 13 + gap + 2;
  } else if (look.header === "split") {
    const pic = Math.max(14, th + 10);
    bar(x, y + (pic - th - 5) / 2, w * 0.42, th, "fill-foreground/40");
    bar(x, y + (pic + th - 1) / 2, w * 0.3, 2, "fill-foreground/15");
    bar(x + w * 0.52, y, w * 0.48, pic, "fill-foreground/15", r);
    y += pic + gap + 2;
  } else {
    bar(x, y, cw * 0.55, th, "fill-foreground/40");
    bar(x, y + th + 3, cw * 0.35, 2, "fill-foreground/15");
    y += th + 5 + gap + 2;
  }

  // Two sections: numbered or not, between hairlines or space, the second on its own ground.
  for (const i of [0, 1]) {
    if (i && look.separation === "hairline") {
      back.push(<rect key="rule" x={x} y={y - gap / 2 - 0.25} width={w} height={0.5} className="fill-foreground/15" />);
    }
    if (i && look.grounds === "alternate") back.push(<rect key="ground" x={side} y={y - gap / 2} width={area} height={H} className="fill-foreground/[0.05]" />);
    const hx = look.numbering ? x + 6 : x;
    if (look.numbering) bar(x, y, 3.5, 3, "fill-foreground/30", 0.75);
    bar(hx, y, cw * 0.38, 3, "fill-foreground/30");
    y += 3 + gap * 0.8;
    // Round looks set their second section on a card.
    if (i && (look.radius ?? 8) >= 16) {
      bar(x, y, cw, 12, "fill-foreground/[0.08]", r);
      bar(x + 4, y + 3.5, cw * 0.5, 2, "fill-foreground/15");
      bar(x + 4, y + 7, cw * 0.35, 2, "fill-foreground/15");
      y += 12 + gap * 1.5;
      continue;
    }
    bar(x, y, cw, 2, "fill-foreground/15");
    bar(x, y + 4, cw * 0.72, 2, "fill-foreground/15");
    y += 6 + gap * 1.5;
  }

  // Contents beside the page.
  if (toc) [0, 4, 8].forEach((dy, i) => bar(x + w - toc + 5, top + dy, i === 1 ? 8 : 11, 1.5, "fill-foreground/15"));

  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} className="bg-muted/40 block aspect-[3/2] w-full rounded-md">
      {back}
      {front}
    </svg>
  );
}
