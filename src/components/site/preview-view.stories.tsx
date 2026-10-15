import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { PreviewView } from "@/components/site/preview-view";
import { bookView } from "@/components/site/story-site";

const PREVIEW = {
  brand: "blender",
  name: "Blender",
  ref: "pr-12",
  title: "Warmer voice",
  commit: "4f2c9e1a7b",
  updatedAt: "2026-10-14T09:00:00.000Z",
  expiresAt: "2026-11-14T09:00:00.000Z",
};

/** A preview's link: the brand's site as a pull request's files would make it, under a bar that says so. */
const meta = preview.meta({
  title: "Brand site/Parts/Preview",
  component: PreviewView,
  parameters: { layout: "fullscreen" },
  args: {
    token: "pv_acme",
    view: bookView("blender", "voice"),
    preview: PREVIEW,
  },
});

export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("note")).toHaveTextContent("Warmer voice (pr-12) at 4f2c9e1");
    await expect(canvas.getByRole("link", { name: /Typography/ })).toHaveAttribute("href", "/preview/pv_acme/typography");
  },
});

/** A branch with no pull request: its ref, no title. */
export const Branch = meta.story({ args: { preview: { ...PREVIEW, title: null, ref: "brand/voice", commit: null } } });
