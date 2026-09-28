"use client";

import { memo, useMemo } from "react";
import { CardsSection } from "@/components/brand-sections/cards";
import { CollectionSection } from "@/components/brand-sections/collection";
import { CoverSection } from "@/components/brand-sections/cover";
import { DoDontSection } from "@/components/brand-sections/dodont";
import { SectionFrame } from "@/components/brand-sections/frame";
import { GallerySection } from "@/components/brand-sections/gallery";
import { HeaderSection } from "@/components/brand-sections/header";
import { LinksSection } from "@/components/brand-sections/links";
import { LogosSection } from "@/components/brand-sections/logos";
import { PagesSection } from "@/components/brand-sections/pages";
import { PaletteSection } from "@/components/brand-sections/palette";
import { Body } from "@/components/brand-sections/slots";
import { SplitSection } from "@/components/brand-sections/split";
import { TextSection } from "@/components/brand-sections/text";
import { TypeSection } from "@/components/brand-sections/type";
import type { SectionProps } from "@/components/brand-sections/types";
import { useSite } from "@/components/site/site-context";
import { PageTabs } from "@/components/site/tabs";
import { boundKeys, type Section, type Template } from "@/lib/pages";
import { resolve } from "@/lib/rules";
import { groupTabs, type ViewPage } from "@/lib/site";

/**
 * A page's sections, drawn: one renderer per template, each in the same
 * frame, shared by the in-app reader, portals and the builder's canvas.
 */

type Renderer = {
  View: React.ComponentType<SectionProps>;
  /** Draws its own title and ground: cover, header. */
  own?: true;
};

/** A template with no renderer here is a type error. */
export const RENDERERS: Record<Template, Renderer> = {
  cover: { View: CoverSection, own: true },
  header: { View: HeaderSection, own: true },
  text: { View: TextSection },
  split: { View: SplitSection },
  cards: { View: CardsSection },
  palette: { View: PaletteSection },
  type: { View: TypeSection },
  logos: { View: LogosSection },
  dodont: { View: DoDontSection },
  gallery: { View: GallerySection },
  collection: { View: CollectionSection },
  links: { View: LinksSection },
  pages: { View: PagesSection },
};

/** A template from a newer server than this page: the frame, its title and its body, at least. */
const FALLBACK: Renderer = { View: Unknown };
function Unknown() {
  return <Body />;
}

const same = (a: SectionProps, b: SectionProps) =>
  a.section === b.section && a.rules.length === b.rules.length && a.rules.every((r, i) => r === b.rules[i]);

/** One section. Drawn again only when its section object or one of its rules changes, which keeps a long canvas quick to type in. */
export const SectionView = memo(function SectionView({ section, rules }: SectionProps) {
  const { View, own } = RENDERERS[section.template] ?? FALLBACK;
  return <SectionFrame section={section} rules={rules} View={View} own={own} />;
}, same);

/**
 * A page's sections in order: those for another context left out, and the
 * tabbed ones grouped under the page's tab strip, between the untabbed ones
 * before and after it.
 */
export function PageBody({ page }: { page: ViewPage }) {
  const { view, context } = useSite();
  // One resolution for the page; each section then picks its keys, the same rule objects every time.
  const byKey = useMemo(() => new Map(resolve(view.rules, context ?? "").map((r) => [r.key, r])), [view.rules, context]);
  const { before, tabs, after } = useMemo(
    () => groupTabs(page.sections.filter((s) => !s.only || (s.only === "default" ? null : s.only) === context)),
    [page.sections, context],
  );
  const draw = (s: Section) => <SectionView key={s.id} section={s} rules={boundKeys(s).flatMap((k) => byKey.get(k) ?? [])} />;
  return (
    <>
      {before.map(draw)}
      {tabs.length > 0 && <PageTabs tabs={tabs} render={draw} />}
      {after.map(draw)}
    </>
  );
}
