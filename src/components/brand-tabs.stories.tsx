import preview from "#.storybook/preview";
import { acme, longBrand, me, viewer, withMe } from "../../.storybook/fixtures/brands";
import { expect, fn, screen, waitFor } from "storybook/test";
import { BrandTabMenu, BrandTabs } from "@/components/brand-tabs";

const meta = preview.meta({
  title: "App/Features/Brands/Tabs",
  component: BrandTabs,
  args: { brand: acme, at: "overview" as const },
  argTypes: { at: { control: "select", options: ["overview", "rules", "assets", "guidelines", "releases", "sharing", "theme", "insights", "settings"] } },
  decorators: [withMe(me)],
});

/** The row under a brand's header, the tab on show marked. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(canvas.getByRole("link", { name: "Rules" })).toHaveAttribute("href", "/brands/acme/rules");
  },
});

/** A page from the menu (Settings) joins the row while it is on show. */
export const MenuPageOnShow = meta.story({
  args: { at: "settings" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  },
});

/** A viewer: the menu's pages they may not use (Theme, Settings) never join the row. */
export const Viewer = meta.story({
  args: { at: "settings" },
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
  },
});

export const LongName = meta.story({ args: { brand: longBrand } });

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

/** The tabs folded into a menu on the brand's name (focus mode); `here` runs a tab in place. */
export const Menu = meta.story({
  render: (args) => <BrandTabMenu brand={args.brand} at="guidelines" here={{ rules: fn() }} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Acme, its tabs" }));
    await expect(await screen.findByRole("menuitem", { name: /Guidelines/ })).toHaveAttribute("aria-current", "page");
    await expect(screen.getByRole("menuitem", { name: "Settings" })).toBeInTheDocument();
    // Closed before axe runs: an open menu hides the page behind it.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  },
});
