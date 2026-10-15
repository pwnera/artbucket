import preview from "#.storybook/preview";
import { expect, screen } from "storybook/test";
import { inApp } from "../../../.storybook/fixtures/library";
import { BrandReader } from "@/components/site/brand-reader";
import { bookView } from "@/components/site/story-site";

/**
 * A brand's pages as readers see them, inside the app (/brands/{slug}/guidelines?focus=1): the brand's site under
 * the app's bar, which says whether it shows the draft or the live release, with the contexts, comments, Theme and
 * Edit beside it for those who may.
 */
const meta = preview.meta({
  title: "Brand site/Parts/Brand reader",
  component: BrandReader,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/brands/blender/guidelines", query: { focus: "1" } } } },
  args: { initial: bookView("blender", "voice"), status: { publish: "current" as const, live: 2 }, version: "draft" as const },
  decorators: [inApp],
});

/** The draft, up to date with what readers see. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Draft · Up to date")).toBeInTheDocument();
    await expect(canvas.getByRole("combobox", { name: "Read the rules for a context" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  },
});

/** The draft has changes readers don't see yet: a switch between it and the live release. */
export const Behind = meta.story({
  args: { status: { publish: "behind" as const, live: 2 } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("radio", { name: "Draft" })).toBeChecked();
    await expect(canvas.getByRole("radio", { name: "@2 live" })).toBeInTheDocument();
  },
});

/** Never released. */
export const NeverReleased = meta.story({ args: { status: { publish: "never" as const, live: null } } });

/** A viewer reads: no Theme, no Edit. */
export const Viewer = meta.story({
  parameters: { app: { scope: "read" } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  },
});

/** With `?comments=1`, the page's review comments open beside it. */
export const Comments = meta.story({
  parameters: { nextjs: { navigation: { pathname: "/brands/blender/guidelines", query: { focus: "1", comments: "1" } } } },
  play: async () => {
    await expect(await screen.findByRole("dialog", { name: /Comments/ })).toBeInTheDocument();
  },
});
