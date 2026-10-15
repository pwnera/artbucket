import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { SectionView } from "@/components/brand-sections";
import { bookView, StorySite } from "@/components/site/story-site";
import { OpenTabProvider, PageTabs } from "@/components/site/tabs";
import { boundKeys } from "@/lib/pages";
import { resolve } from "@/lib/rules";
import { groupTabs } from "@/lib/site";

const view = bookView("blender", "color");
const rules = resolve(view.rules, "");
const { tabs } = groupTabs(view.page!.sections);

/**
 * A page's tabs (Color: Screen and Print), as ARIA tabs: arrow keys move between them, and picking one puts
 * `#tab-{name}` in the address, so it can be linked to. Every panel stays in the page, so print shows them all.
 */
const meta = preview.meta({
  title: "Brand site/Parts/Page tabs",
  component: PageTabs,
  // Blender's own pairs in its swatches (white on orange): the brand's colors, left out of axe (site-view.stories).
  parameters: { layout: "fullscreen", a11y: { context: { exclude: ["[data-specimen]"] } } },
  args: {
    tabs,
    render: (s) => <SectionView key={s.id} section={s} rules={boundKeys(s).flatMap((k) => rules.filter((r) => r.key === k))} />,
  },
  decorators: [
    (Story) => (
      <StorySite view={view}>
        <OpenTabProvider page="color">{Story()}</OpenTabProvider>
      </StorySite>
    ),
  ],
});

export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    const print = canvas.getByRole("tab", { name: "Print" });
    await userEvent.click(print);
    await expect(print).toHaveAttribute("aria-selected", "true");
    await expect(location.hash).toBe("#tab-print");
    await userEvent.keyboard("{ArrowLeft}");
    await expect(canvas.getByRole("tab", { name: "Screen" })).toHaveFocus();
  },
});
