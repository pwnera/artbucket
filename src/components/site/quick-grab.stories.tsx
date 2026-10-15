import preview from "#.storybook/preview";
import { expect, fn, screen, waitFor } from "storybook/test";
import { QuickGrab } from "@/components/site/quick-grab";
import { bookView, PORTAL, StorySite } from "@/components/site/story-site";

const view = bookView("blender", "color");

/** Quick grab: the few things a portal's readers come for, pinned in its bar: an asset to download, a page, a link. */
const meta = preview.meta({
  title: "Brand site/Parts/Quick grab",
  component: QuickGrab,
  args: { quick: PORTAL.site.quick!, base: "/p/blender", first: "blender", onNavigate: fn() },
  decorators: [(Story) => <StorySite view={view}>{Story()}</StorySite>],
});

/** A page opens on the portal through `onNavigate`, and the menu closes. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Quick grab" }));
    await expect(await screen.findByRole("menuitem", { name: "The logo" })).toHaveAttribute("download");
    await expect(screen.getByRole("menuitem", { name: /Blender's site/ })).toHaveAttribute("target", "_blank");
    await userEvent.click(screen.getByRole("menuitem", { name: "Color" }));
    await expect(args.onNavigate).toHaveBeenCalledWith("/p/blender/color");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  },
});

/** On the portal's own domain its base is "": a path stays a path. */
export const OwnDomain = meta.story({
  args: { base: "" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Quick grab" }));
    await expect(await screen.findByRole("menuitem", { name: "Color" })).toHaveAttribute("href", "/color");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  },
});
