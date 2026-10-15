import preview from "#.storybook/preview";
import { expect, fn } from "storybook/test";
import { Pager } from "@/components/site/pager";
import { bookView, rootsOf, StorySite } from "@/components/site/story-site";

const view = bookView("blender", "color");
const rtl = bookView("rtl", "color");

/** The pages either side in reading order, at the foot of a page; locked ones are passed over. */
const meta = preview.meta({
  title: "Brand site/Parts/Pager",
  component: Pager,
  args: { roots: rootsOf(view), current: "color", onNavigate: fn() },
  decorators: [(Story) => <StorySite view={view}>{Story()}</StorySite>],
});

export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const next = canvas.getByRole("link", { name: /Next/ });
    await expect(next).toHaveAttribute("rel", "next");
    await userEvent.click(next);
    await expect(args.onNavigate).toHaveBeenCalledWith("?page=typography");
  },
});

/** The first page: only Next. */
export const First = meta.story({
  args: { current: "overview" },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link", { name: /Previous/ })).not.toBeInTheDocument();
  },
});

/** The last page: only Previous. */
export const Last = meta.story({ args: { current: "voice" } });

/** In a book read right to left, the arrows turn round. */
export const RightToLeft = meta.story({
  args: { roots: rootsOf(rtl), current: "color" },
  decorators: [(Story) => <StorySite view={rtl}>{Story()}</StorySite>],
});
