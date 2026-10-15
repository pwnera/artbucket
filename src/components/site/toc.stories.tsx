import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { bookView, StorySite } from "@/components/site/story-site";
import { OpenTabProvider } from "@/components/site/tabs";
import { OnThisPage } from "@/components/site/toc";

const color = bookView("blender", "color");
const voice = bookView("blender", "voice");

/** On this page: the page's titled sections, grouped under their tabs, the one being read marked as you scroll. */
const meta = preview.meta({
  title: "Brand site/Parts/On this page",
  component: OnThisPage,
  args: { sections: voice.page!.sections },
  decorators: [
    (Story) => (
      <StorySite view={voice}>
        <OpenTabProvider page="voice">
          <div className="max-w-56">
            <Story />
          </div>
        </OpenTabProvider>
      </StorySite>
    ),
  ],
});

/** Each title links to its section's anchor. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("navigation", { name: "On this page" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "How we write" })).toHaveAttribute("href", "#habits");
  },
});

/** A page with tabs (Color: Screen and Print): their sections under each tab's name. */
export const Tabbed = meta.story({
  args: { sections: color.page!.sections },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Print").length).toBeGreaterThan(1);
    await expect(canvas.getByRole("link", { name: "Print values" })).toHaveAttribute("href", "#print-values");
  },
});
