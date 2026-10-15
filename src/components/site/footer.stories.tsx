import preview from "#.storybook/preview";
import { expect, fn } from "storybook/test";
import { AskNotice, PoweredBy, SiteFooter } from "@/components/site/footer";
import { bookView, PORTAL, StorySite } from "@/components/site/story-site";

const view = bookView("blender", "color");

/**
 * The foot of a portal's site: its words and links, when the brand was last published and What's new, where to
 * send feedback, the credit line, and on the free plan "Powered by Artbucket".
 */
const meta = preview.meta({
  title: "Brand site/Parts/Footer",
  component: SiteFooter,
  args: { portal: PORTAL, base: "/p/blender", onNavigate: fn(), privacy: "https://acme.test/privacy" },
  decorators: [(Story) => <StorySite view={view}>{Story()}</StorySite>],
});

export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole("navigation", { name: "Footer" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Send feedback" })).toHaveAttribute("href", "mailto:brand@acme.test");
    await expect(canvas.getByRole("link", { name: /Powered by/ })).toHaveAttribute("href", expect.stringContaining("utm_source=blender"));
    await userEvent.click(canvas.getByRole("link", { name: "What's new" }));
    await expect(args.onNavigate).toHaveBeenCalledWith("/p/blender?view=updates");
  },
});

/** White-label (a paid plan): no Powered by. */
export const WhiteLabel = meta.story({
  args: { portal: { ...PORTAL, madeWith: false } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link", { name: /Powered by/ })).not.toBeInTheDocument();
  },
});

/** A portal with no footer of its own: When it was updated, What's new and Privacy. */
export const Plain = meta.story({ args: { portal: { ...PORTAL, site: {}, madeWith: false } } });

/** The pill alone, as the free plan's portals carry it. */
export const PoweredByPill = meta.story({ render: () => <PoweredBy slug="blender" /> });

/** Under a form that asks a visitor for their email: who gets it, and the policy. */
export const Notice = meta.story({ render: (args) => <AskNotice privacy={args.privacy} /> });
