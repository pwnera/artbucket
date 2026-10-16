import preview from "#.storybook/preview";
import { acme, assetFiles, emptyStatus, longBrand, me, northwind, release, rules, source, status, viewer, withMe } from "#.storybook/fixtures/brands";
import { inApp } from "#.storybook/fixtures/library";
import { getRouter, useSelectedLayoutSegments } from "@storybook/nextjs-vite/navigation.mock";
import { http, HttpResponse } from "msw";
import { expect, mocked, screen, spyOn, waitFor, within } from "storybook/test";
import { BrandAddresses, BrandHeader, BrandPageHeader } from "@/components/brand-header";

const PINS = "artbucket:pinned:org_acme";
const css = ":root {\n  --color-primary: #2f62ff;\n}\n";
let body: unknown;

const meta = preview.meta({
  title: "App/Features/Brands/Header",
  component: BrandHeader,
  args: { brand: acme, origin: "https://app.artbucket.test", rules, status, release, at: "overview" as const, compact: false },
  argTypes: { at: { control: "select", options: ["overview", "rules", "assets", "guidelines", "releases", "sharing", "look", "insights", "settings"] } },
  parameters: { layout: "fullscreen" },
  decorators: [withMe(me)],
  beforeEach: ({ msw }) => {
    body = undefined;
    msw.use(assetFiles, http.get("/api/v1/brand/tokens", () => HttpResponse.text(css)));
    // Pins are this browser's: none before each story, and whatever was there put back after.
    let was: string | null = null;
    try {
      was = localStorage.getItem(PINS);
      localStorage.removeItem(PINS);
    } catch {}
    return () => {
      try {
        if (was === null) localStorage.removeItem(PINS);
        else localStorage.setItem(PINS, was);
      } catch {}
    };
  },
});

/** Acme: released, one edit behind, on BrandHub and a portal. Its mark, name, what is live and where, the note, and the actions. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Acme" })).toBeInTheDocument();
    await expect(canvas.getByRole("img", { name: "acme.test verified" })).toBeInTheDocument();
    await expect(canvas.getByText("acme/acme")).toBeInTheDocument();
    await expect(canvas.getByText("Unreleased changes")).toBeInTheDocument();
    // Behind the live release: Release is the one filled button, and opens in place.
    await expect(canvas.getByRole("button", { name: "Release" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    await expect(canvas.getByText(/Signal orange for alerts/)).toBeInTheDocument();
  },
});

/** Where readers get the live release: a popover of links out. */
export const WhereItIsLive = meta.story({
  play: async ({ canvas, userEvent }) => {
    const where = canvas.getByRole("button", { name: "on BrandHub and Acme brand portal" });
    await userEvent.click(where);
    await expect(await screen.findByRole("link", { name: /Acme brand portal/ })).toHaveAttribute("href", "https://acme.artbucket.test");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** Up to date: no Release, the live line says so. */
export const UpToDate = meta.story({
  args: { status: { ...status, publish: "current" as const } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Up to date")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Release" })).not.toBeInTheDocument();
  },
});

/** Never released (Northwind): no mark but its initial, Release offered. */
export const NeverReleased = meta.story({
  args: { brand: northwind, rules: [], status: emptyStatus, release: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Never released")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Release" })).toBeInTheDocument();
  },
});

/** Use this brand: the addresses an agent reads it from, each a copy away. */
export const CopyTheAddress = meta.story({
  beforeEach: () => {
    const clip = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    return () => clip.mockRestore();
  },
  play: async ({ canvas, userEvent }) => {
    const use = canvas.getByRole("button", { name: /Use this brand/ });
    await userEvent.click(use);
    await userEvent.click(await screen.findByRole("button", { name: "Copy the Connect an agent (MCP) address" }));
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://app.artbucket.test/api/v1/mcp");
    // Public on BrandHub: its brand.json at the release.
    await expect(screen.getByText("https://hub.artbucket.test/acme/acme@12/brand.json")).toBeInTheDocument();
    await userEvent.click(use);
    await waitFor(() => expect(screen.queryByText("Start from this brand")).not.toBeInTheDocument());
  },
});

/** Use this brand, Tokens: every format is on the brand's Sharing tab, the one place for them. */
export const Tokens = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Use this brand/ }));
    const tokens = (await screen.findByText("Tokens")).closest("li")!;
    await userEvent.click(within(tokens as HTMLElement).getByRole("button", { name: "Get" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/brands/acme/sharing#tokens"));
  },
});

/** Start from this brand: Duplicate makes "Acme copy" at once, opens it, and its toast offers Rename. */
export const Duplicate = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.post("/api/v1/brands", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { ...acme, id: "brd_copy", slug: "acme-copy", name: "Acme copy", default: false } });
      }),
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Use this brand/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(body).toEqual({ name: "Acme copy", from: "acme" }));
    await expect(await screen.findByText("Created Acme copy")).toBeInTheDocument();
    await expect(getRouter().push).toHaveBeenCalledWith("/brands/acme-copy");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    await expect(getRouter().push).toHaveBeenCalledWith("/brands/acme-copy/settings");
  },
});

/** The brand's menu: pin it to the sidebar, and the menu says Unpin next time. */
export const Pin = meta.story({
  play: async ({ canvas, userEvent }) => {
    const more = canvas.getByRole("button", { name: "More for Acme" });
    await userEvent.click(more);
    await expect(await screen.findByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/brands/acme/settings");
    await userEvent.click(screen.getByRole("menuitem", { name: "Pin to the sidebar" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(PINS) ?? "[]")).toEqual([{ id: "brd_acme", type: "brand", label: "Acme", href: "/brands/acme" }]));
    // Closed for good before it opens again: a click while it fades out would land on the closing menu.
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument(), { timeout: 3000 });
    await userEvent.click(more);
    await expect(await screen.findByRole("menuitem", { name: "Unpin from the sidebar" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument(), { timeout: 3000 });
  },
});

/** Kept in a repository: its button, a dot while edits here wait to reach it. */
export const InGit = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/brands/acme/source", () => HttpResponse.json({ data: source }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: /acme\/brand/ })).toHaveAttribute("title", "Changes here not yet in github.com/acme/brand");
  },
});

/** Not in Git, on a server with a Git integration: Connect Git is in the brand's menu. */
export const ConnectGit = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/brands/acme/source", () => HttpResponse.json({ data: { source: null, connect: source.connect } }))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Acme" }));
    await waitFor(async () => expect(await screen.findByRole("menuitem", { name: "Connect Git" })).toHaveAttribute("href", source.connect));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument(), { timeout: 3000 });
  },
});

/** A viewer: Use this brand and the menu, no Edit or Release. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Release" })).not.toBeInTheDocument();
  },
});

/** Status couldn't be read: what is live from the release alone. */
export const NoStatus = meta.story({
  args: { status: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("@12 live")).toBeInTheDocument();
  },
});

export const LongName = meta.story({ args: { brand: longBrand } });

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

/** Over the guidelines: one line, the tabs inline, the actions as icons, what is live in a popover. */
export const Compact = meta.story({
  args: { compact: true, at: "guidelines" as const },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Edit" })).toHaveAttribute("title", "Edit");
    await expect(canvas.getByRole("link", { name: "Guidelines" })).toHaveAttribute("aria-current", "page");
  },
});

export const CompactPhone = meta.story({ args: { compact: true, at: "guidelines" as const }, globals: { viewport: { value: "phone" } } });

/** Over a tab's page, as its layout draws it: the crumbs, then the header, the tab read from the address. */
export const PageHeader = meta.story({
  render: (args) => <BrandPageHeader brand={args.brand} origin={args.origin} rules={args.rules} status={args.status} release={args.release} importing={false} />,
  decorators: [inApp],
  beforeEach: () => {
    mocked(useSelectedLayoutSegments).mockReturnValue(["rules"]);
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Rules" })).toHaveAttribute("aria-current", "page");
    await expect(canvas.getByRole("link", { name: "Acme" })).toHaveAttribute("href", "/brands/acme");
  },
});

/** The addresses alone, as the Sharing tab shows them: private on BrandHub, so no brand.json or llms.txt. */
export const Addresses = meta.story({
  render: (args) => (
    <div className="grid max-w-md gap-3 p-4">
      <BrandAddresses brand={args.brand} origin={args.origin} hub={{ visibility: "private", url: "https://hub.artbucket.test/acme/acme" }} release={args.release} onTokens={() => {}} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("brand.json")).not.toBeInTheDocument();
    await expect(canvas.getByText("PowerPoint template")).toBeInTheDocument();
  },
});

/** Release opens in place: the note, what changes folded, and the full page a link away. */
export const ReleaseInPlace = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Release" }));
    await expect(await screen.findByRole("textbox", { name: "Note for readers" })).toBeInTheDocument();
    await expect(screen.getByRole("link", { name: "Open full page" })).toHaveAttribute("href", "/brands/acme/releases/new");
    await userEvent.click(canvas.getByRole("button", { name: "Release" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Note for readers" })).not.toBeInTheDocument());
  },
});

/** Edit offers what is edited here first, the rules and the look, then the ways to change the pages. */
export const EditMenu = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Edit" }));
    await expect(await screen.findByRole("menuitem", { name: "Rules" })).toHaveAttribute("href", "/brands/acme/rules");
    await expect(screen.getByRole("menuitem", { name: /^Look/ })).toHaveAttribute("href", "/brands/acme/look");
    await expect(screen.getByRole("menuitem", { name: "Change the pages…" })).toHaveAttribute("href", "/brands/acme/guidelines?ways=1");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  },
});

/** The name is edited where it is shown: a click makes it a field, Enter saves it. */
export const RenameInPlace = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.patch("/api/v1/brands/acme", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { ...acme, name: "Acme Inc" } });
      }),
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Acme" }));
    const field = canvas.getByRole("textbox", { name: "Brand name" });
    await userEvent.clear(field);
    await userEvent.type(field, "Acme Inc{Enter}");
    await waitFor(() => expect(body).toEqual({ name: "Acme Inc" }));
    await expect(getRouter().refresh).toHaveBeenCalled();
  },
});
