"use client";

import { useMemo } from "react";
import { LOOK } from "@/components/brand-sections/look";
import { Aside, Eyebrow, Lede, SectionScope, Title, titleOf } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { AnchorLink } from "@/components/site/anchors";
import { ContextScope, useMedia, useSite } from "@/components/site/site-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sectionGround } from "@/lib/brand-theme";
import { boundKeys, type Section, TEMPLATE_INFO } from "@/lib/pages";
import { contextLabel, resolve } from "@/lib/rules";
import type { ViewRule } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * What every section sits in: its landmark and anchor, its width and ground,
 * its heading (eyebrow, title with a copy-link, lede), a tab per context when
 * it shows several, and the aside beside what the template draws. A template
 * draws only its own part, <Body/> included, wherever it wants the body.
 */

/** A reading column, a wide frame, or the whole width. */
const WIDTH: Record<Section["width"], string> = {
  text: "max-w-(--brand-measure)",
  wide: "max-w-280",
  full: "max-w-none",
};

/** Section titles on the theme's scale (its `titles`), or the section's own size, held to the container on a phone. */
const H2 = "text-[length:min(var(--brand-h2),8cqi)] @3xl:text-[length:min(var(--brand-h2),8cqi)] leading-tight";
const SIZED: Record<NonNullable<Section["size"]>, string> = {
  medium: "text-[length:min(var(--brand-h2-medium),8cqi)] @3xl:text-[length:min(var(--brand-h2-medium),8cqi)] leading-tight",
  large: "text-[length:min(var(--brand-h2-large),9cqi)] @3xl:text-[length:min(var(--brand-h2-large),9cqi)] leading-[1.1]",
  huge: "text-[length:min(var(--brand-h2-huge),10cqi)] @3xl:text-[length:min(var(--brand-h2-huge),10cqi)] leading-[1.05]",
};

export type Ground = { className?: string; style?: React.CSSProperties };

/**
 * A section's ground from its tone (lib/brand-theme.ts sectionGround): its
 * color, its own ink, quiet text, links and lines, and the app's tokens over
 * them (D13), so reused parts follow it; the scheme it reads as; a picture
 * under its scrim; a hairline accent along its top; the device tiled over a
 * pattern (globals.css). With no surface, a tint or a panel is mixed from
 * the app's own light or dark. Plain is the page's own. Cover and header
 * draw their grounds themselves, with this.
 */
export function useGround({ tone, background }: Pick<Section, "tone" | "background">): Ground {
  const { view, context, url } = useSite();
  const image = useMedia(background?.image);
  return useMemo(() => {
    // A color rule in the context being read; "" matches none, the default versions.
    const colorOf = (key: string) => resolve(view.rules.filter((r) => r.key === key), context ?? "")[0];
    const g = sectionGround(view.theme, { tone, background }, colorOf);
    if (g.background === null) return {};
    const style: Record<string, string> = { ...g.vars, backgroundColor: g.background, color: g.vars["--brand-ink"] };
    if (g.rule) style.borderBlockStart = `2px solid ${g.rule}`;
    if (g.gradient) style.backgroundImage = g.gradient;
    if (g.scrim !== undefined && image?.preview) {
      const scrim = `rgb(0 0 0 / ${g.scrim})`;
      style.backgroundImage = `linear-gradient(${scrim}, ${scrim}), url(${JSON.stringify(url(image.id, "/w_2400,f_webp"))})`;
      style.backgroundPosition = image.focus ? `${image.focus.x * 100}% ${image.focus.y * 100}%` : "center";
    }
    return {
      // A ground following the app's scheme takes no class, and picks its accent as the page does.
      className: cn(g.dark === null ? LOOK : g.dark ? "dark" : "light", g.scrim !== undefined && "bg-cover", tone === "pattern" && "ground-pattern"),
      style: style as React.CSSProperties,
    };
  }, [view.theme, view.rules, context, url, image, tone, background]);
}

/** Padding below a section, and above it: none when joined to the one before, less when tight, more when loose. */
const PAD_END = "pb-[calc(var(--brand-gap)*2)] @3xl:pb-[calc(var(--brand-gap)*8/3)]";
const PAD_TOP = {
  joined: "pt-0",
  tight: "pt-[calc(var(--brand-gap)*2/3)]",
  normal: "pt-[calc(var(--brand-gap)*2)] @3xl:pt-[calc(var(--brand-gap)*8/3)]",
  loose: "pt-[calc(var(--brand-gap)*4)] @3xl:pt-[calc(var(--brand-gap)*16/3)]",
};

/** Templates that draw their own ground (cover, header): what follows one starts afresh. */
const OWN_GROUND = new Set<Section["template"]>(["cover", "header"]);

/** The sections readers see on this page, in the context being read. */
function useDrawn(): Section[] {
  const { view, context } = useSite();
  return useMemo(
    () => view.page?.sections.filter((x) => !x.hidden && (!x.only || (x.only === "default" ? null : x.only) === context)) ?? [],
    [view.page, context],
  );
}

/**
 * A section's ground as drawn: its tone, unless the theme alternates grounds,
 * when every second section on the page's own ground sits on the panel
 * instead. Covers and headers draw their own and don't count.
 */
export function useTone(s: Section): Section["tone"] {
  const { view } = useSite();
  const drawn = useDrawn();
  if (view.theme.grounds !== "alternate" || s.tone !== "plain" || OWN_GROUND.has(s.template)) return s.tone;
  // A plain section takes the panel when the one drawn before it sits on the page's own ground; a section with a ground of its own resets the count.
  const before = drawn[drawn.findIndex((x) => x.id === s.id) - 1];
  if (!before || OWN_GROUND.has(before.template) || before.tone !== "plain") return "plain";
  const run = drawn.slice(0, drawn.indexOf(before) + 1).reverse();
  let n = 0;
  for (const x of run) {
    if (x.tone !== "plain" || OWN_GROUND.has(x.template)) break;
    n++;
  }
  return n % 2 === 1 ? "panel" : "plain";
}

/**
 * Two sections in a row on the page's own ground read as one flow: the second
 * takes no space above it, the first's below is enough, and with the theme's
 * `separation` a hairline marks the seam. A ground, a band, a cover or another
 * tab between them breaks the flow.
 */
function useJoined(s: Section, tone: Section["tone"]): "space" | "hairline" | null {
  const { view } = useSite();
  const drawn = useDrawn();
  // Loose sets it apart: its own room, never a seam.
  if (tone !== "plain" || s.space === "loose") return null;
  const prev = drawn[drawn.findIndex((x) => x.id === s.id) - 1];
  // Alternating grounds, the section before a plain one is on the panel: no seam to draw.
  if (!prev || prev.tone !== "plain" || view.theme.grounds === "alternate" || OWN_GROUND.has(prev.template) || (prev.tab ?? null) !== (s.tab ?? null)) return null;
  return view.theme.separation;
}

/** A section's bound rules for one context: its version there, else the default, in the section's order. */
function rulesIn(all: ViewRule[], s: Section, context: string | null): ViewRule[] {
  // A context is a slug, so "" matches none: the default versions.
  const byKey = new Map(resolve(all, context ?? "").map((r) => [r.key, r]));
  return boundKeys(s).flatMap((k) => byKey.get(k) ?? []);
}

/** `default` in a section's contexts is the rules without one. */
const contextOf = (c: string) => (c === "default" ? null : c);

export function SectionFrame({
  section: s,
  rules,
  View,
  own,
  tabs = true,
}: SectionProps & {
  View: React.ComponentType<SectionProps>;
  /** The template draws its own heading and ground (cover, header). */
  own?: boolean;
  /** A tab per context; false when the template lays its contexts out itself (specs). */
  tabs?: boolean;
}) {
  const { view, context, idOf } = useSite();
  const tone = useTone(s);
  // The section's own size, else its template's (a statement is a headline), else the theme's `titles`.
  const size = s.size ?? TEMPLATE_INFO[s.template]?.size;
  const center = s.template === "statement" && s.props.align === "center";
  const ground = useGround(useMemo(() => ({ tone, background: s.background }), [tone, s.background]));
  const joined = useJoined(s, tone);
  const id = idOf(s.id);
  const name = TEMPLATE_INFO[s.template]?.name ?? s.template;
  const scope = useMemo(() => ({ section: s, anchors: true }), [s]);
  const others = useMemo(() => ({ section: s, anchors: false }), [s]);

  const landmark = {
    id,
    "aria-labelledby": s.title ? titleOf(id) : undefined,
    "aria-label": s.title ? undefined : name,
    "data-template": s.template,
    "data-tone": tone,
  };

  if (own)
    return (
      <section {...landmark} className="@container scroll-mt-20">
        <SectionScope.Provider value={scope}>
          <View section={s} rules={rules} />
        </SectionScope.Provider>
      </section>
    );

  // Every panel stays in the DOM, hidden when not picked, so print shows them all.
  const content = s.contexts && tabs ? (
    <Tabs defaultValue={s.contexts.find((c) => contextOf(c) === context) ?? s.contexts[0]} className="gap-6">
      <TabsList variant="line" aria-label="Context">
        {s.contexts.map((c) => (
          <TabsTrigger key={c} value={c}>
            {contextLabel(c)}
          </TabsTrigger>
        ))}
      </TabsList>
      {s.contexts.map((c, i) => (
        <TabsContent key={c} value={c} forceMount className="data-[state=inactive]:hidden print:data-[state=inactive]:block">
          <ContextScope context={contextOf(c)}>
            <SectionScope.Provider value={i === 0 ? scope : others}>
              <View section={s} rules={rulesIn(view.rules, s, contextOf(c))} />
            </SectionScope.Provider>
          </ContextScope>
        </TabsContent>
      ))}
    </Tabs>
  ) : (
    <View section={s} rules={rules} />
  );

  return (
    <section {...landmark} className={cn("@container scroll-mt-20", ground.className)} style={ground.style}>
      <SectionScope.Provider value={scope}>
        <div
          className={cn(
            "mx-auto px-6 @3xl:px-10",
            PAD_END,
            PAD_TOP[joined === "space" ? "joined" : (s.space ?? "normal")],
            joined === "hairline" && "border-t",
            WIDTH[s.width],
          )}
        >
          {(s.eyebrow || s.title || s.lede) && (
            <header className={cn("group/section mb-[calc(var(--brand-gap)*4/3)] space-y-3", center && "mx-auto max-w-4xl text-center")}>
              <Eyebrow />
              {s.title && (
                <div className={cn("flex items-center gap-1", center && "justify-center")}>
                  <Title className={cn("min-w-0", size ? SIZED[size] : H2)} />
                  <AnchorLink id={id} label={`Copy a link to ${s.title}`} className="group-hover/section:opacity-100" />
                </div>
              )}
              <Lede />
            </header>
          )}
          {s.aside ? (
            <div className="grid gap-8 @3xl:grid-cols-[minmax(0,1fr)_16rem] @3xl:gap-12">
              <div className="min-w-0">{content}</div>
              <Aside className="border-t pt-6 @3xl:border-t-0 @3xl:border-s @3xl:ps-6 @3xl:pt-0" />
            </div>
          ) : (
            content
          )}
        </div>
      </SectionScope.Provider>
    </section>
  );
}
