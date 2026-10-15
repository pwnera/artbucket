import preview from "../../.storybook/preview";
import type { ComponentType } from "react";
import { expect } from "storybook/test";
import { fixtureUrl, fixtureView } from "@/lib/fixtures/brand-book";
import type { Asset, Rule } from "./html.js";
import * as kit from "./react.js";
import "./ui.css";

/** The release a story draws: BrandHub's (`loaded.brand`), else, offline, the Blender fixture book's rules. */
type Release = { rules: Rule[] };
const FALLBACK: Rule[] = fixtureView("blender").rules;
const rulesOf = (loaded: Record<string, unknown>) => (loaded.brand as Release | undefined)?.rules ?? FALLBACK;
// A file is a signed URL on BrandHub's release, a drawn placeholder in the fixture.
const src = (asset: Asset) => (asset as Asset & { url?: string }).url ?? fixtureUrl(asset.id);

// The kit types its components loosely (they return the host's elements): as React components here.
const as = <P,>(c: (p: P) => unknown) => c as unknown as ComponentType<P>;
const Palette = as(kit.Palette);
const TypeSpecimen = as(kit.TypeSpecimen);
const LogoGrid = as(kit.LogoGrid);
const DoDont = as(kit.DoDont);
const RuleList = as(kit.RuleList);
const RuleValue = as(kit.RuleValue);

/**
 * `@artbucket/ui/react`: draw a brand's rules from an Artbucket release (the palette with contrast, the type specimen,
 * logos, dos and don'ts, any rule's value) as React components, rendered on the server or in the browser. MIT.
 *
 * ```js
 * import { Palette } from "@artbucket/ui/react"; // <Palette rules={...} />
 * ```
 *
 * Style: `@artbucket/ui/ui.css`. Here they draw the Artbucket brand's latest release from BrandHub
 * (.storybook/preview.tsx, `loaded.brand`), so Monday's accent shows too; offline, the Blender fixture book's.
 */
const meta = preview.meta({ title: "Kit/React" });

/** `<Palette rules keys context src />`: each color a chip with the text the brand sets on it, its values, and how it reads on white and black. */
export const ThisWeeksAccent = meta.story({
  name: "Palette: this week's accent",
  render: (_, { loaded }) => <Palette rules={rulesOf(loaded)} keys={["color.primary", "color.onPrimary"]} src={src} />,
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("On white").length).toBeGreaterThan(0);
  },
});

/** The six accents the brand turns through, a week each: `keys` names them. */
export const WeeklyAccents = meta.story({
  name: "Palette: weekly accents",
  render: (_, { loaded }) => <Palette rules={rulesOf(loaded)} keys={["color.volt", "color.iris", "color.signal", "color.tide", "color.moss", "color.fuchsia"]} src={src} />,
});

/** A group by its keys: the neutrals. */
export const Neutrals = meta.story({
  name: "Palette: neutrals",
  render: (_, { loaded }) => <Palette rules={rulesOf(loaded)} keys={["color.ink", "color.muted", "color.background", "color.panel", "color.border", "color.dark"]} src={src} />,
});

/** `<TypeSpecimen rules keys sample />`: the faces, each set in itself, a large sample, its name and its alphabet. */
export const Type = meta.story({
  name: "TypeSpecimen",
  render: (_, { loaded }) => <TypeSpecimen rules={rulesOf(loaded)} keys={["type.*"]} sample="Change your brand once." src={src} />,
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Change your brand once.").length).toBeGreaterThan(0);
  },
});

/** `<LogoGrid rules keys src />`: every rule with an image (logos, marks, icons), each on its own tile; `src(asset)` says where its file is. */
export const Logos = meta.story({
  name: "LogoGrid",
  render: (_, { loaded }) => <LogoGrid rules={rulesOf(loaded)} keys={["logo.*"]} src={src} />,
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("img").length).toBeGreaterThan(0);
  },
});

/** `<DoDont items />`: dos and don'ts, `{ verdict, title?, text?, image? }`, here from the logo's own rules. */
export const LogoDosAndDonts = meta.story({
  name: "DoDont",
  render: (_, { loaded }) => {
    const list = (key: string) => [rulesOf(loaded).find((r) => r.key === key)?.value ?? []].flat().map(String);
    const items = [
      ...list("logo.always").map((text) => ({ verdict: "do" as const, text })),
      ...list("logo.neverDo").map((text) => ({ verdict: "dont" as const, text })),
    ];
    // Offline, a pair of the kit's own.
    return <DoDont items={items.length ? items : [{ verdict: "do", text: "Give the logo room." }, { verdict: "dont", text: "Stretch it." }]} />;
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Do").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("Don't").length).toBeGreaterThan(0);
  },
});

/** `<RuleList rules keys />`: the rules that are neither colors, faces nor images (voice, spacing, words), as a list of terms. */
export const Voice = meta.story({
  name: "RuleList",
  render: (_, { loaded }) => <RuleList rules={rulesOf(loaded)} keys={["tone.*", "brand.*"]} src={src} />,
});

/** `<RuleValue rule src />`: one rule's value, inline: a color's chip and hex, a face set in itself, an image, or its words. */
export const Tagline = meta.story({
  name: "RuleValue",
  render: (_, { loaded }) => {
    const rules = rulesOf(loaded);
    return (
      <p className="flex flex-wrap items-center gap-6">
        {["brand.tagline", "brand.mission", "color.primary", "type.primary", "type.heading"].map((key) => (
          <RuleValue key={key} rule={rules.find((r) => r.key === key && !r.context)} src={src} />
        ))}
      </p>
    );
  },
});
