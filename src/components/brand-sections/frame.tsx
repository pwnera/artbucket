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

/** Section titles on the theme's scale, held to the container on a phone. */
const H2 = "text-[length:min(var(--brand-h2),8cqi)] @3xl:text-[length:min(var(--brand-h2),8cqi)] leading-tight";

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
  const ground = useGround(s);
  const id = idOf(s.id);
  const name = TEMPLATE_INFO[s.template]?.name ?? s.template;
  const scope = useMemo(() => ({ section: s, anchors: true }), [s]);
  const others = useMemo(() => ({ section: s, anchors: false }), [s]);

  const landmark = {
    id,
    "aria-labelledby": s.title ? titleOf(id) : undefined,
    "aria-label": s.title ? undefined : name,
    "data-template": s.template,
    "data-tone": s.tone,
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
        <div className={cn("mx-auto px-6 py-[calc(var(--brand-gap)*2)] @3xl:px-10 @3xl:py-[calc(var(--brand-gap)*8/3)]", WIDTH[s.width])}>
          {(s.eyebrow || s.title || s.lede) && (
            <header className="group/section mb-[calc(var(--brand-gap)*4/3)] space-y-3">
              <Eyebrow />
              {s.title && (
                <div className="flex items-center gap-1">
                  <Title className={H2} />
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
