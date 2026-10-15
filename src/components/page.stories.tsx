import preview from "#.storybook/preview";
import { inApp } from "#.storybook/fixtures/library";
import { expect, screen, waitFor, within } from "storybook/test";
import { IconPalette, IconPlus } from "@/components/icons";
import { AppHeader, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Every page's top bar: the sidebar's toggle, where you are as a trail, and what you can do here on the right. */
const meta = preview.meta({
  title: "App/Features/Shell/Page header",
  component: AppHeader,
  args: { trail: [{ label: "Brands", href: "/brands" }, { label: "Acme" }] },
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/brands/acme" } } },
  decorators: [inApp],
});

/** A trail whose last step is this page, and the page's actions. */
export const Playground = meta.story({
  args: {
    children: (
      <Button size="sm">
        <IconPlus /> New rule
      </Button>
    ),
  },
  play: async ({ canvas }) => {
    const trail = canvas.getByRole("navigation", { name: "Breadcrumb" });
    await expect(trail).toBeInTheDocument();
    await expect(within(trail).getByRole("link", { name: "Brands" })).toHaveAttribute("href", "/brands");
    await expect(within(trail).getByText("Acme")).toHaveAttribute("aria-current", "page");
    await expect(canvas.getByRole("button", { name: "New rule" })).toBeInTheDocument();
  },
});

/** Its toggle folds the sidebar to icons and back. */
export const ToggleSidebar = meta.story({
  play: async ({ canvas, userEvent }) => {
    const sidebar = () => document.querySelector("[data-slot=sidebar]")!;
    await expect(sidebar()).toHaveAttribute("data-state", "collapsed");
    await userEvent.click(canvas.getByRole("button", { name: "Toggle sidebar" }));
    await expect(sidebar()).toHaveAttribute("data-state", "expanded");
  },
});

/** A page that draws its own trail (the brand's name, with its menu). */
export const OwnTrail = meta.story({
  args: { trail: <span className="truncate text-sm font-medium">Acme, Guidelines</span> },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
  },
});

/** An admin on the server's own limits, where the server sells plans: Upgrade, before the page's actions. */
export const Upgrade = meta.story({
  parameters: { app: { me: { upgrade: "https://app.artbucket.test/billing" } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "https://app.artbucket.test/billing");
  },
});

/** Signed out (a public page in the app's frame): the theme toggle, which the account menu holds otherwise. */
export const SignedOut = meta.story({ parameters: { app: { me: { user: null } } } });

/** A long trail: earlier steps give way on a phone, the last one truncates. */
export const LongTrail = meta.story({
  args: {
    trail: [
      { label: "Brands", href: "/brands" },
      { label: "Acme International Holdings Partner Programme for Resellers", href: "/brands/acme-international" },
      { label: "Guidelines for every reseller and partner in the region, autumn edition" },
    ],
  },
});

/** On a phone the sidebar is a sheet and its search sits in it: Search opens Jump to in one tap. */
export const Phone = meta.story({
  globals: { viewport: { value: "phone" } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await expect(await screen.findByRole("dialog", { name: "Jump to" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** Every page opens the same way under the bar: what this is in one line, a count beside it, and its actions. */
export const PageTitle = meta.story({
  render: () => (
    <div className="p-6">
      <PageHeader icon={<IconPalette />} title="Brands" aside={<Badge variant="secondary">3</Badge>} description="Every brand in Acme, and who sees each on BrandHub.">
        <Button size="sm">
          <IconPlus /> New brand
        </Button>
      </PageHeader>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Brands" })).toBeInTheDocument();
  },
});

/** A long title truncates; the actions wrap under it on a phone. */
export const PageTitleLong = meta.story({
  globals: { viewport: { value: "phone" } },
  render: () => (
    <div className="p-4">
      <PageHeader icon={<IconPalette />} title="Acme International Holdings Partner Programme for Resellers" description="Its rules, pages and theme, released to every reseller.">
        <Button size="sm" variant="outline">
          Release
        </Button>
      </PageHeader>
    </div>
  ),
});
