import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { brandAssets, brandRules, renditions } from "#.storybook/fixtures/library";
import { BrandAssets } from "@/components/brand-assets";

/**
 * A brand's Assets tab (BrandAssets), read-only: the files its rules hold and its pages show, each opening in the
 * library and saying where it is used. Pictures as tiles, typefaces as a list, anything else last.
 */
const meta = preview.meta({
  title: "App/Features/Library/Brand assets",
  component: BrandAssets,
  args: { assets: brandAssets, rules: brandRules },
  beforeEach: ({ msw }) => void msw.use(...renditions),
});

/** Logos and a photo, two typeface files, the guidelines PDF; each says which rule or page uses it. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Logos and images 3" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /Acme logo, full color/ })).toHaveAttribute("href", "/assets?asset=ast_logo");
    await expect(canvas.getByText("Primary logo, the Logo page")).toBeInTheDocument();
  },
});

/** No files yet: what puts them here. */
export const Empty = meta.story({
  args: { assets: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/No files yet/)).toBeInTheDocument();
  },
});

/** The brand's files couldn't load. */
export const Failed = meta.story({ args: { assets: null } });

/** Typefaces alone. */
export const Typefaces = meta.story({ args: { assets: brandAssets.filter((a) => a.mime.startsWith("font/")) } });

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
