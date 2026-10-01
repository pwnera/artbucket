"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { IconDownload } from "@tabler/icons-react";
import { toast } from "sonner";
import type { z } from "zod";
import { HEAD, LABEL } from "@/components/brand-sections/look";
import { Body, Opens, RuleSlot } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { CopyButton } from "@/components/copy-button";
import { FontPlayground, useAssetFont } from "@/components/font-preview";
import { saveZip } from "@/components/save-zip";
import { useSite } from "@/components/site/site-context";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/external-link";
import { stack } from "@/lib/brand-theme";
import { fileSlug } from "@/lib/branding";
import { fileTypeBadge, formatBytes } from "@/lib/filename";
import { embedCss, fontFiles, fontStyle, GOOGLE_FAMILY, googleFontsCss, pickFace, SCRIPT_SAMPLES, trackingAt, weightName } from "@/lib/font";
import { type FONT_SPEC, fontValue, ruleName } from "@/lib/rules";
import type { ViewAsset, ViewRule } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * A type specimen: each rule's face set in itself, and the scale; with
 * `roles`, a table of which face plays which part at what size, leading,
 * tracking and case. Then each family once, however many rules set it: a
 * line per weight and per script, its character sets (`glyphs`), its files
 * one by one or zipped (unless a rule says download: false), where it comes
 * from, the code to load it elsewhere (`embed`), and a playground. With a
 * `formula`, the section is that scale instead, set in its first face: the
 * faces themselves are another type section's.
 */
export function TypeSection({ section, rules }: SectionProps) {
  const p = section.props;
  const sample = typeof p.sample === "string" ? p.sample : undefined;
  const fonts = rules.filter((r) => r.type === "font");
  const families = familiesOf(fonts);
  const formula = p.formula as Formula | undefined;
  return (
    <div className="space-y-10">
      <Body />
      {formula && <Scale formula={formula} font={fonts[0]} face={families[0]} sample={sample} />}
      {!formula && rules.length > 0 && (
        // Its own container: the frame's is the whole section, wider than a reading column.
        <div className="@container">
          <div className={cn("grid gap-x-10 gap-y-8", section.columns > 1 && "@3xl:grid-cols-2")}>
            {rules.map((r) => (
              <RuleSlot key={r.key} rule={r} />
            ))}
          </div>
        </div>
      )}
      {p.roles === true && fonts.length > 0 && <Roles rules={fonts} families={families} />}
      {!formula && families.map((f) => <Family key={f.family} f={f} sample={sample} glyphs={p.glyphs === true} embed={p.embed === true} />)}
    </div>
  );
}

type Spec = z.output<typeof FONT_SPEC>;
const specOf = (r: ViewRule) => (r.spec ?? {}) as Spec;

/** A family as the section shows it once: every file of its rules, the weights and scripts they set it in, and where it comes from. */
type Face = {
  family: string;
  files: ViewAsset[];
  weights: number[];
  /** Those with a sample (SCRIPT_SAMPLES), Latin when none says. */
  scripts: string[];
  fallback?: string;
  source?: Spec["source"];
  url?: string;
  license?: string;
  /** No rule of it says download: false, which hides the buttons, never the face. */
  download: boolean;
};

function familiesOf(rules: ViewRule[]): Face[] {
  const groups = new Map<string, ViewRule[]>();
  for (const r of rules) {
    const { family } = fontValue(r.value);
    groups.set(family, [...(groups.get(family) ?? []), r]);
  }
  return [...groups].map(([family, rs]) => {
    const specs = rs.map(specOf);
    const first = <K extends keyof Spec>(k: K) => specs.find((s) => s[k] !== undefined)?.[k];
    const files = [...new Map(rs.flatMap((r) => fontFiles(r)).map((a) => [a.id, a])).values()];
    const upright = files.map((a) => fontStyle(a.filename)).filter((s) => !s.italic);
    const weights = [...new Set([...upright.map((s) => s.weight), ...rs.map((r) => fontValue(r.value).weight ?? 400)])];
    const scripts = [...new Set(specs.flatMap((s) => (s.script && SCRIPT_SAMPLES[s.script] ? [s.script] : [])))];
    const url = first("url");
    return {
      family,
      files,
      weights: weights.sort((a, b) => a - b),
      scripts: scripts.length ? scripts : ["Latn"],
      // Font names only: it lands in a style and in code to paste, where nothing may end the declaration.
      fallback: first("fallback")?.replace(/[^\w\s,"'-]/g, "").trim() || undefined,
      source: first("source"),
      // The schema lets only http(s) in; a link is where a bad one would bite, so it is checked here too.
      url: url && /^https?:\/\//.test(url) ? url : undefined,
      license: first("license"),
      download: !specs.some((s) => s.download === false),
    };
  });
}

/**
 * Text in a family at `weight`: from its file for that weight, invisible
 * until loaded so it never shows in the fallback first; by name without files.
 */
function InFace({
  f,
  weight = 400,
  as: El = "p",
  className,
  style,
  ...rest
}: { f: Face; weight?: number; as?: "p" | "span" } & React.HTMLAttributes<HTMLElement>) {
  const loaded = useAssetFont(pickFace(f.files, weight)?.id);
  return (
    <El
      {...rest}
      className={cn("transition-opacity duration-200", loaded === undefined && "opacity-0", className)}
      style={{ fontFamily: stack({ family: f.family, fallback: f.fallback }, loaded), fontWeight: weight, ...style }}
    />
  );
}

/** A script's sample, in its language and direction. The section's own sample stands in for Latin, in whatever language it is. */
function inScript(script: string, sample?: string) {
  const s = SCRIPT_SAMPLES[script];
  const own = script === "Latn" && sample;
  return { children: own || s.sample, lang: own ? undefined : s.lang, dir: s.rtl ? "rtl" : undefined };
}

const SCRIPT = new Intl.DisplayNames(["en"], { type: "script" });

// ---- a scale by formula -------------------------------------------------------

type Formula = { base: number; ratio: number; steps: number };

/** Two places for px, three for rem, no trailing zeros. */
const round = (n: number, places: number) => Number(n.toFixed(places));

/**
 * A modular scale: base times ratio to the power of each step, from the
 * top step down to the base, each line set at its size (held to the
 * container; the numbers say the true size) with its px and its rem (of 16px).
 */
function Scale({ formula: { base, ratio, steps }, font, face, sample }: { formula: Formula; font?: ViewRule; face?: Face; sample?: string }) {
  const weight = font && (fontValue(font.value).weight ?? 400);
  const text = face ? inScript(face.scripts[0], sample) : { children: sample ?? SCRIPT_SAMPLES.Latn.sample };
  const lines = (
    <div className="@container space-y-4">
      <p className="text-muted-foreground text-sm">
        {base}px × {ratio}
        <sup>n</sup>, {steps} steps up
      </p>
      {Array.from({ length: steps + 1 }, (_, i) => steps - i).map((n) => {
        const px = base * ratio ** n;
        const size = { fontSize: `min(${round(px, 2)}px, 14cqi)` };
        return (
          <div key={n} className="grid min-w-0 gap-1 @xl:grid-cols-[10rem_minmax(0,1fr)] @xl:items-baseline @xl:gap-4">
            <span className="text-muted-foreground text-xs tabular-nums">
              {n ? `Step ${n}` : "Base"} · {round(px, 2)}px · {round(px / 16, 3)}rem
            </span>
            {face ? (
              <InFace f={face} weight={weight} className="truncate leading-tight" style={size} {...text} />
            ) : (
              <p className={cn(HEAD, "truncate leading-tight")} style={size} {...text} />
            )}
          </div>
        );
      })}
    </div>
  );
  return font ? <Opens rule={font}>{lines}</Opens> : lines;
}

// ---- roles --------------------------------------------------------------------

const NONE = "–";
const CASES: Record<NonNullable<Spec["case"]>, { word: string; css?: React.CSSProperties }> = {
  none: { word: "As written" },
  upper: { word: "Uppercase", css: { textTransform: "uppercase" } },
  lower: { word: "Lowercase", css: { textTransform: "lowercase" } },
  title: { word: "Title case", css: { textTransform: "capitalize" } },
  "small-caps": { word: "Small caps", css: { fontVariantCaps: "small-caps" } },
};
const em = (n: number) => (n ? `${n}em` : "0");
const trackingText = (t: Spec["tracking"]) =>
  t === undefined
    ? NONE
    : Array.isArray(t)
      ? [...t]
          .sort((a, b) => a[0] - b[0])
          .map(([size, e]) => `${em(e)} at ${size}px`)
          .join(", ")
      : em(t);

/** Specimens stay within a table row: a bigger size says so in its column. */
const ROW_CAP = 40;

/** Each font rule as a row: its part, set as the part is, then the numbers that set it, as text. */
function Roles({ rules, families }: { rules: ViewRule[]; families: Face[] }) {
  const title = useId();
  return (
    <div role="group" aria-labelledby={title} className="space-y-4">
      <h3 id={title} className={cn(HEAD, "text-(length:--brand-h3) leading-snug")}>
        Roles
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr>
              {["Role", "Face", "Size", "Line height", "Tracking", "Case"].map((h) => (
                <th key={h} scope="col" className="pe-4 pb-2 text-start font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => {
              const v = fontValue(r.value);
              const s = specOf(r);
              const weight = v.weight ?? 400;
              const track = trackingAt(s.tracking, v.size ?? 16);
              const name = ruleName(r);
              const role = s.role && s.role[0].toUpperCase() + s.role.slice(1);
              return (
                <tr key={`${r.key}@${r.context ?? ""}`} className="border-t align-baseline">
                  <th scope="row" className="py-3 pe-4 text-start font-normal">
                    <InFace
                      as="span"
                      f={families.find((f) => f.family === v.family)!}
                      weight={weight}
                      className="block break-words"
                      style={{
                        fontSize: Math.min(v.size ?? 16, ROW_CAP),
                        lineHeight: s.lineHeight,
                        letterSpacing: track === undefined ? undefined : `${track}em`,
                        fontFeatureSettings: s.features?.map((x) => `"${x}" 1`).join(", "),
                        ...CASES[s.case ?? "none"].css,
                      }}
                    >
                      {role ?? name}
                    </InFace>
                    {role && role !== name && <span className="text-muted-foreground block text-xs">{name}</span>}
                  </th>
                  <td className="py-3 pe-4 whitespace-nowrap">
                    {v.family} · {weight} {weightName(weight)}
                  </td>
                  <td className="py-3 pe-4 whitespace-nowrap tabular-nums">{v.size ? `${v.size}px` : NONE}</td>
                  <td className="py-3 pe-4 tabular-nums">{s.lineHeight ?? NONE}</td>
                  <td className="py-3 pe-4 tabular-nums">{trackingText(s.tracking)}</td>
                  <td className="py-3 whitespace-nowrap">{s.case ? CASES[s.case].word : NONE}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- a family -----------------------------------------------------------------

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className={cn(LABEL, "text-muted-foreground")}>{title}</h4>
      {children}
    </div>
  );
}

function Family({ f, sample, glyphs, embed }: { f: Face; sample?: string; glyphs: boolean; embed: boolean }) {
  const title = useId();
  const playground = pickFace(f.files);
  const many = f.scripts.length > 1;
  return (
    <div role="group" aria-labelledby={title} className="space-y-8 border-t pt-8">
      {/* A Google face with no files here, as the theme loads its own (brand-theme.ts fontFaceCss): the same URL, so one fetch. */}
      {f.source === "google" && !f.files.length && GOOGLE_FAMILY.test(f.family) && (
        <link rel="stylesheet" href={`${googleFontsCss(f.family)}&display=swap`} precedence="default" />
      )}
      <div className="space-y-1">
        <h3 id={title} className={cn(HEAD, "text-(length:--brand-h3) leading-snug")}>
          {f.family}
        </h3>
        <Source f={f} />
      </div>

      <Part title={many ? "Weights" : `Weights, in ${SCRIPT.of(f.scripts[0])}`}>
        <div className="@container space-y-3">
          {f.weights.map((w) => (
            <div key={w} className="grid min-w-0 gap-1 @xl:grid-cols-[8rem_minmax(0,1fr)] @xl:items-baseline @xl:gap-4">
              <span className="text-muted-foreground text-xs tabular-nums">
                {w} {weightName(w)}
              </span>
              <InFace f={f} weight={w} className="truncate text-3xl leading-tight" {...inScript(f.scripts[0], sample)} />
            </div>
          ))}
        </div>
      </Part>

      {many && (
        <Part title="Scripts">
          <div className="@container space-y-3">
            {f.scripts.map((s) => (
              <div key={s} className="grid min-w-0 gap-1 @xl:grid-cols-[8rem_minmax(0,1fr)] @xl:items-baseline @xl:gap-4">
                <span className="text-muted-foreground text-xs">{SCRIPT.of(s)}</span>
                <InFace f={f} className="text-2xl leading-snug break-words" {...inScript(s, sample)} />
              </div>
            ))}
          </div>
        </Part>
      )}

      {glyphs &&
        f.scripts.map((s) => (
          <Part key={s} title={many ? `Character set, ${SCRIPT.of(s)}` : "Character set"}>
            <InFace f={f} className="text-2xl leading-relaxed break-all" lang={SCRIPT_SAMPLES[s].lang} dir={SCRIPT_SAMPLES[s].rtl ? "rtl" : undefined}>
              {SCRIPT_SAMPLES[s].glyphs}
            </InFace>
          </Part>
        ))}

      {f.download && f.files.some((a) => !a.kept) && <Files f={{ ...f, files: f.files.filter((a) => !a.kept) }} />}
      {embed && <Embed f={f} />}

      {playground && (
        <Part title={`Try ${f.family}`}>
          <FontPlayground id={playground.id} sample={sample} flow />
        </Part>
      )}
    </div>
  );
}

const SOURCES: Partial<Record<NonNullable<Spec["source"]>, string>> = {
  google: "Google Fonts",
  adobe: "Adobe Fonts",
  system: "System font",
  files: "The brand's files",
};

/** Where the family comes from and on what terms: a link when a rule gives one. */
function Source({ f }: { f: Face }) {
  const from = f.source && SOURCES[f.source];
  if (!from && !f.url && !f.license) return null;
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-sm">
      {f.url ? (
        <ExternalLink href={f.url} className="text-foreground inline-flex items-center gap-1 underline underline-offset-2">
          {from ?? new URL(f.url).hostname}
        </ExternalLink>
      ) : (
        from && <span>{from}</span>
      )}
      {f.license && (
        <span>
          {(from || f.url) && "· "}
          {f.license}
        </span>
      )}
    </p>
  );
}

/** The family's files, each a download, and all of them as one zip. */
function Files({ f }: { f: Face }) {
  const { url } = useSite();
  const [busy, setBusy] = useState(false);
  const total = f.files.reduce((n, a) => n + a.size, 0);
  const zip = async () => {
    setBusy(true);
    try {
      const files = await Promise.all(
        f.files.map(async (a) => {
          const res = await fetch(url(a.id, "?download"));
          if (!res.ok) throw new Error(`${a.filename}: ${res.status}`);
          return { name: a.filename, data: new Uint8Array(await res.arrayBuffer()) };
        }),
      );
      saveZip(files, `${fileSlug(f.family) || "font"}.zip`);
    } catch {
      toast.error(`Couldn't zip ${f.family}`, { description: "Download its files one by one instead." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Part title="Files">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr>
              {["File", "Style", "Format", "Size"].map((h) => (
                <th key={h} scope="col" className={cn("pb-2 font-medium", h === "Size" ? "text-end" : "pe-4 text-start")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {f.files.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="py-2 pe-4">
                  <a href={url(a.id, "?download")} download={a.filename} className="inline-flex items-center gap-1.5 break-all hover:underline">
                    <IconDownload className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                    {a.filename}
                  </a>
                </td>
                <td className="text-muted-foreground py-2 pe-4 whitespace-nowrap">{fontStyle(a.filename).label}</td>
                <td className="text-muted-foreground py-2 pe-4 font-mono text-xs">{fileTypeBadge(a.filename, a.mime)}</td>
                <td className="text-muted-foreground py-2 text-end whitespace-nowrap tabular-nums">{formatBytes(a.size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {f.files.length > 1 && (
        <Button variant="outline" size="sm" pending={busy} onClick={zip}>
          <IconDownload /> Download all {f.files.length} as a zip ({formatBytes(total)})
        </Button>
      )}
    </Part>
  );
}

// ---- embed --------------------------------------------------------------------

const never = () => () => {};

/** A file's URL for another site: absolute, and without the day-long signature a public file doesn't need. Relative until the page knows its origin. */
function publicUrl(path: string, origin: string) {
  const u = new URL(path, origin || "http://localhost");
  u.searchParams.delete("s");
  return origin ? u.href : `${u.pathname}${u.search}`;
}

/** The code to load the family on another site, and the stack to set text in, each a copy away. */
function Embed({ f }: { f: Face }) {
  const { url } = useSite();
  const origin = useSyncExternalStore(never, () => location.origin, () => "");
  const code = embedCss(f.family, {
    google: f.source === "google",
    files: f.files,
    weights: f.weights,
    url: (id) => publicUrl(url(id), origin),
  });
  const use = `font-family: ${[JSON.stringify(f.family), f.fallback].filter(Boolean).join(", ")};`;
  return (
    <Part title="Embed">
      {code && <Code text={code} what="the embed code" />}
      {code.startsWith("@font-face") && (
        <p className="text-muted-foreground text-xs">These URLs load on other sites once the files are public; until then, for people signed in.</p>
      )}
      <Code text={use} what="the font stack" />
    </Part>
  );
}

/** Code reads left to right on any page. */
function Code({ text, what }: { text: string; what: string }) {
  return (
    <div dir="ltr" className="relative">
      <pre className="bg-muted overflow-x-auto rounded-lg p-4 pe-12 font-mono text-xs leading-relaxed">
        <code>{text}</code>
      </pre>
      <CopyButton text={text} label={`Copy ${what}`} what={what} className="absolute top-2 end-2" />
    </div>
  );
}
