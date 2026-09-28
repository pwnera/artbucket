"use client";

import { useMemo } from "react";
import { Aside, Eyebrow, Lede, SectionScope, Title, titleOf } from "@/components/brand-sections/slots";
import type { SectionProps } from "@/components/brand-sections/types";
import { AnchorLink } from "@/components/site/anchors";
import { ContextScope, useMedia, useRule, useSite } from "@/components/site/site-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inkOn, isHex } from "@/lib/color";
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
  text: "max-w-[var(--brand-measure,42rem)]",
  wide: "max-w-280",
  full: "max-w-none",
};

type Ground = { className?: string; style?: React.CSSProperties };

/**
 * A ground the section's own color sets: text in black or white, whichever
 * reads, and the app's quiet text and lines mixed from the two, so reused
 * parts follow it. A dark one also gets `dark`.
 */
function on(hex: string | undefined): Ground {
  if (!hex || !isHex(hex)) return { className: "dark bg-primary text-primary-foreground" };
  const ink = inkOn(hex.slice(0, 7));
  return {
    className: cn(ink === "#ffffff" && "dark"),
    style: {
      backgroundColor: hex,
      color: ink,
      "--foreground": ink,
      "--muted-foreground": `color-mix(in oklab, ${ink} 72%, ${hex})`,
      "--border": `color-mix(in oklab, ${ink} 20%, ${hex})`,
    } as React.CSSProperties,
  };
}

/**
 * The section's ground, from its tone. W2 draws them from the app's tokens
 * and the brand's accent; W3 replaces this with the theme's sectionGround.
 * ponytail: pattern is a tint until the theme's device draws it (W3).
 */
function useGround(s: Section): Ground {
  const { view } = useSite();
  const color = useRule(s.background?.color);
  const image = useMedia(s.background?.image);
  switch (s.tone) {
    case "tint":
    case "pattern":
      return { className: "bg-[color-mix(in_oklab,var(--brand-accent,var(--primary))_7%,var(--background))]" };
    case "panel":
      return { className: "bg-muted" };
    case "dark":
      return { className: "dark bg-background text-foreground" };
    case "brand":
      return on(view.theme.v1.accent?.light);
    case "color":
      return on(typeof color?.value === "string" ? color.value : undefined);
    case "image": {
      if (!image?.preview) return { className: "dark bg-background text-foreground" };
      const scrim = `rgb(0 0 0 / ${s.background?.scrim ?? 0.45})`;
      return {
        className: "dark bg-cover bg-center text-foreground",
        style: { backgroundImage: `linear-gradient(${scrim}, ${scrim}), url("${image.preview}")` },
      };
    }
    default:
      return {};
  }
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
}: SectionProps & {
  View: React.ComponentType<SectionProps>;
  /** The template draws its own heading and ground (cover, header). */
  own?: boolean;
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
  const content = s.contexts ? (
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
        <div className={cn("mx-auto px-6 py-12 @3xl:px-10 @3xl:py-16", WIDTH[s.width])}>
          {(s.eyebrow || s.title || s.lede) && (
            <header className="group/section mb-8 space-y-3">
              <Eyebrow />
              {s.title && (
                <div className="flex items-center gap-1">
                  <Title />
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
