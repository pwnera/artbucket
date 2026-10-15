import preview from "#.storybook/preview";
import { expect, fn } from "storybook/test";
import { NavBar, NavTree } from "@/components/site/nav-tree";
import { bookView, rootsOf, StorySite } from "@/components/site/story-site";
import { tree } from "@/lib/site";

const view = bookView("blender", "color");
// Blender's Logo holds its child as a tab; here it is a chapter, so the tree has a fold to show.
const chaptered = { ...view, nav: view.nav.map((n) => (n.slug === "logo" ? { ...n, tabs: false } : n)) };

/** The site's pages on the start side (or in the sheet): numbered as the theme says, the page being read marked. */
const meta = preview.meta({
  title: "Brand site/Parts/Nav tree",
  component: NavTree,
  args: { roots: rootsOf(view), current: "color", onNavigate: fn() },
  decorators: [
    (Story) => (
      <StorySite view={view}>
        <div className="max-w-64">
          <Story />
        </div>
      </StorySite>
    ),
  ],
});

/** A plain click moves within the site through `onNavigate`; the link keeps a real href for new tabs. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole("link", { name: /Color/ })).toHaveAttribute("aria-current", "page");
    await userEvent.click(canvas.getByRole("link", { name: /Typography/ }));
    await expect(args.onNavigate).toHaveBeenCalledWith("?page=typography");
  },
});

/** A chapter folds without script (a native details), open while it holds the page being read. */
export const Chapter = meta.story({
  args: { roots: tree(chaptered.nav, true), current: "color" },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole("link", { name: /Using the logo/ })).not.toBeVisible();
    await userEvent.click(canvas.getByLabelText("Pages in Logo"));
    await expect(canvas.getByRole("link", { name: /Using the logo/ })).toBeVisible();
  },
});

/** Reading a page in a chapter: the chapter is open, the page marked. */
export const InAChapter = meta.story({
  args: { roots: tree(chaptered.nav, true), current: "logo-use" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /Using the logo/ })).toHaveAttribute("aria-current", "page");
  },
});

/** A page above the reader's level shows locked, and says so to a screen reader. */
export const Locked = meta.story({
  args: { roots: tree(view.nav.map((n) => (n.slug === "voice" ? { ...n, locked: true } : n)), true) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /Voice \(locked\)/ })).toBeInTheDocument();
  },
});

/** Unnumbered, as a theme without `numbering` draws it. */
export const Unnumbered = meta.story({ args: { roots: tree(view.nav, false) } });

/** NavBar: the top pages in a row, for a theme whose nav is `top`; the chapter holding the page is marked. */
export const Bar = meta.story({
  render: (args) => <NavBar {...args} />,
  args: { current: "logo-use" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /Logo/ })).toHaveAttribute("aria-current", "true");
  },
});
