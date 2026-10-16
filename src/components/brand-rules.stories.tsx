import preview from "#.storybook/preview";
import { acme, assetFiles, longBrand, northwind, rules } from "#.storybook/fixtures/brands";
import { http, HttpResponse } from "msw";
import { expect } from "storybook/test";
import { BrandRules } from "@/components/brand-rules";

const css = ":root {\n  --color-primary: #2f62ff;\n  --color-ink: #0b1020;\n}\n";

const meta = preview.meta({
  title: "App/Features/Brands/Rules",
  component: BrandRules,
  args: { brand: acme, rules },
  beforeEach: ({ msw }) => void msw.use(assetFiles, http.get("/api/v1/brand/tokens", () => HttpResponse.text(css))),
});

/** The Rules tab for whoever may only read: every rule by section, colors as a token table, under Use in code. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Use in code" })).toBeInTheDocument();
    await expect(canvas.getByText("logo.primary")).toBeInTheDocument();
    await expect(canvas.getByText("Keep clear space of the logo's height around it.")).toBeInTheDocument();
  },
});

/** Get tokens: the formats are on the brand's Sharing tab, the one place for them. */
export const GetTokens = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Get tokens" })).toHaveAttribute("href", `/brands/${acme.slug}/sharing#tokens`);
  },
});

/** No rules yet (Northwind). */
export const Empty = meta.story({
  args: { brand: northwind, rules: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No rules yet.")).toBeInTheDocument();
  },
});

export const LongName = meta.story({ args: { brand: longBrand } });

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
