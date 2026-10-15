import preview from "#.storybook/preview";
import { brands, me, viewer } from "#.storybook/fixtures/brands";
import { collections } from "#.storybook/fixtures/library";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { http, HttpResponse } from "msw";
import { expect, screen, waitFor, within } from "storybook/test";
import { AppSidebar } from "@/components/app-sidebar";
import { AccessProvider } from "@/components/can";
import { AppHeader } from "@/components/page";
import { Shell } from "@/components/shell";

const PINS = "artbucket:pinned:org_acme";
const sidebar = () => document.querySelector("[data-slot=sidebar]")!;
const fn0 = () => {};

/**
 * The app's one sidebar, in the shell as the (app) layout mounts it: the places, the content, what the person pinned,
 * and at the foot Connections, Settings, BrandHub and the account. Every item is a link.
 */
const meta = preview.meta({
  title: "App/Features/Shell/Sidebar",
  component: AppSidebar,
  args: { me, searches: [], reviewCount: 3, fixesCount: 2, openSearch: fn0, openShortcuts: fn0 },
  argTypes: { openSearch: { table: { disable: true } }, openShortcuts: { table: { disable: true } } },
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/catalog" } } },
  // The shell draws the sidebar from what the layout hands it; ⌘K and the shortcuts sheet are its own.
  render: (args) => (
    <AccessProvider me={args.me}>
      <Shell sidebar={{ me: args.me, collections, brands, searches: args.searches, reviewCount: args.reviewCount, fixesCount: args.fixesCount }} defaultOpen defaultWidth={null}>
        <AppHeader trail={[{ label: "Catalog" }]} />
        <div className="p-6 text-sm">The page beside it.</div>
      </Shell>
    </AccessProvider>
  ),
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/v1/usage", () => HttpResponse.json({ data: { used: { storage: 38e9 }, limits: { storage: 100e9 } } })));
    const kept = localStorage.getItem(PINS);
    localStorage.removeItem(PINS);
    document.cookie = "sidebar_state=; path=/; max-age=0";
    return () => (kept === null ? localStorage.removeItem(PINS) : localStorage.setItem(PINS, kept));
  },
});

/** An admin on the catalog: it is lit, Review and Fixes count what waits, storage stands at the foot. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Catalog" })).toHaveAttribute("data-active", "true");
    await expect(canvas.getByRole("link", { name: /^Review\s*, 3 waiting$/ })).toHaveAttribute("href", "/review");
    await expect(canvas.getByRole("link", { name: /^Fixes\s*, 2 to do$/ })).toBeInTheDocument();
    await expect(await canvas.findByRole("link", { name: "38 GB of 100 GB used" })).toHaveAttribute("href", "/settings/organization/usage");
    await expect(canvas.getByRole("link", { name: /^BrandHub/ })).toHaveAttribute("target", "_blank");
  },
});

/** It folds to icons from the header's toggle or ⌘B (Ctrl+B), and Expand sidebar brings it back. */
export const Collapse = meta.story({
  play: async ({ canvas, userEvent }) => {
    await expect(sidebar()).toHaveAttribute("data-state", "expanded");
    await userEvent.click(canvas.getByRole("button", { name: "Toggle sidebar" }));
    await expect(sidebar()).toHaveAttribute("data-state", "collapsed");
    await userEvent.click(canvas.getByRole("button", { name: "Expand sidebar" }));
    await expect(sidebar()).toHaveAttribute("data-state", "expanded");
    await userEvent.keyboard("{Meta>}b{/Meta}");
    await expect(sidebar()).toHaveAttribute("data-state", "collapsed");
    await userEvent.keyboard("{Control>}b{/Control}");
    await expect(sidebar()).toHaveAttribute("data-state", "expanded");
  },
});

/** Opened folded, as the person last left it (the sidebar_state cookie). */
export const Folded = meta.story({
  render: (args) => (
    <AccessProvider me={args.me}>
      <Shell sidebar={{ me: args.me, collections, brands, searches: [], reviewCount: 0, fixesCount: 0 }} defaultOpen={false} defaultWidth={null}>
        <AppHeader trail={[{ label: "Catalog" }]} />
      </Shell>
    </AccessProvider>
  ),
  play: async () => {
    await expect(sidebar()).toHaveAttribute("data-state", "collapsed");
  },
});

/** Every item is a link, reached with Tab in order; Jump to opens ⌘K. */
export const Keyboard = meta.story({
  play: async ({ canvas, userEvent }) => {
    canvas.getByRole("link", { name: "Explore" }).focus();
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: "Catalog" })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: /^Review\s*, 3 waiting$/ })).toHaveFocus();
    canvas.getByRole("button", { name: /Jump to/ }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(await screen.findByRole("dialog", { name: "Jump to" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** New makes anything this person may: from here, a brand opens the brands page's New brand. */
export const New = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "New" }));
    await expect(await screen.findByRole("menuitem", { name: "Upload files" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Brand" }));
    await expect(getRouter().push).toHaveBeenCalledWith("/brands?new=brand");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  },
});

/** What the person starred, from the catalog or a brand's page; Unpin takes it off. */
export const Pinned = meta.story({
  beforeEach: () =>
    localStorage.setItem(
      PINS,
      JSON.stringify([
        { id: "brd_acme", type: "brand", label: "Acme", href: "/brands/acme" },
        { id: "col_press", type: "collection", label: "Press kit for every reseller in the region", href: "/?collection=col_press" },
      ]),
    ),
  play: async ({ canvas, userEvent }) => {
    const pinned = canvas.getByText("Pinned").closest("[data-sidebar=group]") as HTMLElement;
    await expect(within(pinned).getByRole("link", { name: "Acme" })).toHaveAttribute("href", "/brands/acme");
    await userEvent.click(within(pinned).getByRole("button", { name: "Unpin Acme" }));
    await waitFor(() => expect(within(pinned).queryByRole("link", { name: "Acme" })).not.toBeInTheDocument());
  },
});

/** A viewer: the places to look, no counts to clear, no Fixes, Insights, Automations, Sites or storage. */
export const Viewer = meta.story({
  args: { me: viewer },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Review" })).toBeInTheDocument();
    for (const name of [/^Fixes/, "Insights", "Automations", "Sites"]) await expect(canvas.queryByRole("link", { name })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: /used$/ })).not.toBeInTheDocument();
  },
});

/** Nothing waits and nothing is pinned: no badges. */
export const Quiet = meta.story({ args: { reviewCount: 0, fixesCount: 0 } });

/** A long project name truncates in the switcher. */
export const LongNames = meta.story({
  args: { me: { ...me, project: { ...me.project, name: "Acme International Holdings Partner Programme for Resellers" } } },
});

/** On a phone the sidebar is a sheet: the header's toggle opens it, and a link closes it on the way. */
export const Phone = meta.story({
  globals: { viewport: { value: "phone" } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Toggle sidebar" }));
    const sheet = await screen.findByRole("dialog", { name: "Sidebar" });
    await userEvent.click(within(sheet).getByRole("link", { name: "Templates" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});
