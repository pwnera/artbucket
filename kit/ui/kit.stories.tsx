import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ComponentType } from "react";
import type { Asset, Rule } from "./html.js";
import * as kit from "./react.js";
import "./ui.css";

/**
 * @artbucket/ui drawing the Artbucket brand's latest release, as a site built with the kit does: the release comes
 * from BrandHub (.storybook/preview.tsx, `loaded.brand`), so Monday's accent shows here too. A rule's files are
 * signed URLs there.
 */
type Release = { rules: Rule[] };
// The kit types its components loosely (they return the host's elements): as React components here.
const as = <P,>(c: (p: P) => unknown) => c as unknown as ComponentType<P>;
const Palette = as(kit.Palette);
const TypeSpecimen = as(kit.TypeSpecimen);
const LogoGrid = as(kit.LogoGrid);
const DoDont = as(kit.DoDont);
const RuleList = as(kit.RuleList);
const RuleValue = as(kit.RuleValue);
const src = (asset: Asset) => (asset as Asset & { url?: string }).url ?? "";

const meta = { title: "Brand/Kit" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const rules = (loaded: Record<string, unknown>) => (loaded.brand as Release).rules;

export const ThisWeeksAccent: Story = {
  name: "This week's accent",
  render: (_, { loaded }) => <Palette rules={rules(loaded)} keys={["color.primary", "color.onPrimary"]} src={src} />,
};
export const WeeklyAccents: Story = {
  render: (_, { loaded }) => <Palette rules={rules(loaded)} keys={["color.volt", "color.iris", "color.signal", "color.tide", "color.moss", "color.fuchsia"]} src={src} />,
};
export const Neutrals: Story = {
  render: (_, { loaded }) => <Palette rules={rules(loaded)} keys={["color.ink", "color.muted", "color.background", "color.panel", "color.border", "color.dark"]} src={src} />,
};
export const Type: Story = { render: (_, { loaded }) => <TypeSpecimen rules={rules(loaded)} keys={["type.*"]} sample="Change your brand once." src={src} /> };
export const Logos: Story = { render: (_, { loaded }) => <LogoGrid rules={rules(loaded)} keys={["logo.*"]} src={src} /> };
export const LogoDosAndDonts: Story = {
  name: "Logo dos and don'ts",
  render: (_, { loaded }) => {
    const list = (key: string) => [rules(loaded).find((r) => r.key === key)?.value ?? []].flat().map(String);
    return <DoDont items={[...list("logo.always").map((text) => ({ verdict: "do" as const, text })), ...list("logo.neverDo").map((text) => ({ verdict: "dont" as const, text }))]} />;
  },
};
export const Voice: Story = { render: (_, { loaded }) => <RuleList rules={rules(loaded)} keys={["tone.*"]} src={src} /> };
export const Tagline: Story = { render: (_, { loaded }) => <RuleValue rule={rules(loaded).find((r) => r.key === "brand.tagline")} src={src} /> };
