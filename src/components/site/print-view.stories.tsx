import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { PrintView } from "@/components/site/print-view";
import { bookView } from "@/components/site/story-site";

/** The site alone, for the server's own browser to take a picture of: no app header, every link the reader's address. */
const meta = preview.meta({
  title: "Brand site/Parts/Print view",
  component: PrintView,
  parameters: { layout: "fullscreen" },
  args: { view: bookView("blender", "space") },
});

export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("link", { name: /Voice/ })[0]).toHaveAttribute("href", expect.stringContaining("page=voice"));
  },
});
