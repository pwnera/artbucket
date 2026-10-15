import preview from "#.storybook/preview";
import { assetFiles, rules } from "#.storybook/fixtures/brands";
import { expect } from "storybook/test";
import { BrandCard, type CardBrand } from "@/components/brand-card";

const acmeCard: CardBrand = {
  name: "Acme",
  rules,
  signed: null,
  terms: "Use the Acme logo **as supplied**. Ask brand@acme.test before printing it on merchandise.",
};

const meta = preview.meta({
  title: "App/Features/Brands/Card",
  component: BrandCard,
  args: { brand: acmeCard },
  beforeEach: ({ msw }) => void msw.use(assetFiles),
});

/** A brand's card, as BrandHub lists it and the Overview shows it: colors, type, logos, voice and terms. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    for (const name of ["Colors", "Type", "Logos", "Voice", "Usage terms"]) await expect(canvas.getByRole("heading", { name })).toBeInTheDocument();
    // The dark context's version isn't a second swatch.
    await expect(canvas.getAllByText("#2f62ff")).toHaveLength(1);
    await expect(canvas.getByRole("link", { name: "Download Logo" })).toHaveAttribute("href", "/a/ast_logo?download");
  },
});

/** A logo shown, not handed out (its rights keep it): no download. */
export const KeptLogo = meta.story({
  args: { brand: { ...acmeCard, rules: rules.map((r) => (r.key === "logo.primary" ? { ...r, assets: r.assets.map((a) => ({ ...a, kept: true as const })) } : r)) } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link", { name: "Download Logo" })).not.toBeInTheDocument();
  },
});

/** A file the viewer's session doesn't open (BrandHub signs each one it may): the logo without its picture is left out. */
export const Unsigned = meta.story({
  args: { brand: { ...acmeCard, signed: {} } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("heading", { name: "Logos" })).not.toBeInTheDocument();
  },
});

/** Colors only: the other sections stay away. */
export const ColorsOnly = meta.story({ args: { brand: { ...acmeCard, rules: rules.filter((r) => r.type === "color"), terms: null } } });

/** Nothing yet: what the page puts in its place. */
export const Empty = meta.story({
  args: { brand: { name: "Northwind", rules: [], signed: null, terms: null }, empty: <p className="text-muted-foreground text-sm">Nothing yet: add colors, type and logos in the rules.</p> },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Nothing yet/)).toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
