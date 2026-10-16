import preview from "#.storybook/preview";
import { recorder, treeProjects } from "#.storybook/fixtures/brands";
import { acmeBrand, catalogApi, describeAny, logo, manyAssets, portal, primaryRule } from "#.storybook/fixtures/catalog";
import { inApp } from "#.storybook/fixtures/library";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { useEffect, useState } from "react";
import { expect, screen, waitFor, within } from "storybook/test";
import { CatalogExplorer, type Tab, type TreeProject } from "@/components/catalog";

const sent = recorder();

/**
 * The page as app/(app)/catalog/page.tsx draws it, its address kept here: what the explorer pushes (`?o=`, `?f=`,
 * `&tab=`) becomes the next object, folder and tab, as the server would answer them.
 */
function CatalogPage({ projects, at }: { projects: TreeProject[]; at: string }) {
  const [url, setUrl] = useState(at);
  useEffect(() => void getRouter().push.mockImplementation((u: string) => setUrl(u)), []);
  const q = new URL(url, "https://app.artbucket.test").searchParams;
  const o = q.get("o");
  const folder = o ? null : (q.get("f") ?? projects[0]?.id ?? null);
  return <CatalogExplorer projects={projects} object={o ? describeAny(o) : null} folder={folder} tab={(q.get("tab") ?? "overview") as Tab} />;
}

/**
 * The catalog (/catalog): every project the person reaches as a tree of its objects, and the one picked, with what it
 * is (Overview), what it comes from and what uses it (Lineage), who reaches it (Access) and what happened to it
 * (Activity). A folder of the tree is a page too: what it groups, then what it holds.
 */
const meta = preview.meta({
  title: "App/Features/Catalog/Page",
  component: CatalogExplorer,
  args: { projects: treeProjects, object: null, folder: "prj_acme", tab: "overview" as const },
  argTypes: { tab: { control: "select", options: ["overview", "lineage", "access", "activity"] } },
  decorators: [inApp],
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/catalog" } } },
  beforeEach: ({ msw }) => {
    sent.reset();
    msw.use(...catalogApi());
  },
});

/** The project open, as a folder: its types as tiles, then what changed lately. A row opens its object. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("heading", { name: "Acme", level: 2 })).toBeInTheDocument();
    await expect(canvas.getByText("Project · You are Admin · 8 items")).toBeInTheDocument();
    const tiles = within(canvas.getByRole("region", { name: "In this project" }));
    await expect(tiles.getByRole("button", { name: /Brands/ })).toBeInTheDocument();
    const lately = within(canvas.getByRole("region", { name: "Updated lately" }));
    // A header and the 8 objects of its own: a brand's rules and pages stay the brand's.
    await expect(lately.getAllByRole("row")).toHaveLength(9);
    await userEvent.click(lately.getByText("hero-spring.jpg"));
    await expect(getRouter().push).toHaveBeenCalledWith("/catalog?o=ast_hero", { scroll: false });
  },
});

/**
 * The whole walk with the keyboard: down the tree to a brand, Enter opens it, then each of its tabs, Enter on each,
 * and back up its trail to its folder.
 */
export const KeyboardWalk = meta.story({
  render: () => <CatalogPage projects={treeProjects} at="/catalog" />,
  play: async ({ canvas, userEvent }) => {
    canvas.getByRole("treeitem", { name: /^Acme/ }).focus();
    await userEvent.keyboard("{ArrowDown}{ArrowRight}{ArrowDown}");
    await expect(canvas.getByRole("treeitem", { name: /^Acme @12/ })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(await canvas.findByRole("heading", { name: "Acme", level: 2 })).toBeInTheDocument();
    await expect(canvas.getByText("The Acme brand: colors, type, logo and voice.")).toBeInTheDocument();
    const tabs = within(canvas.getByRole("navigation", { name: "Object" }));
    await expect(tabs.getByRole("button", { name: "overview" })).toHaveAttribute("aria-current", "page");

    tabs.getByRole("button", { name: /lineage/ }).focus();
    await userEvent.keyboard("{Enter}");
    // Lineage loads React Flow on first use: under the whole suite's load that chunk can take a while.
    await expect(await canvas.findByText("Changing acme-logo.svg reaches 3 things downstream, in 1 project.", {}, { timeout: 15_000 })).toBeInTheDocument();

    await userEvent.tab();
    await expect(tabs.getByRole("button", { name: "access" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(await canvas.findByRole("cell", { name: "Grace Hopper" })).toBeInTheDocument();

    tabs.getByRole("button", { name: "activity" }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(await canvas.findByText("Nothing yet.")).toBeInTheDocument();

    // Up the trail: the brand's folder, as a page.
    canvas.getByRole("navigation", { name: "Where it is" }).querySelectorAll("button")[1].focus();
    await userEvent.keyboard("{Enter}");
    await expect(await canvas.findByRole("heading", { name: "Brands", level: 2 })).toBeInTheDocument();
  },
});

/** An asset: its badges, its address to copy, what uses it and where it is shared, each taken back by its X. */
export const ObjectOverview = meta.story({
  args: { object: logo, folder: null },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("heading", { name: "acme-logo.svg" })).toBeInTheDocument();
    await expect(canvas.getByText("acme/acme/asset/acme-logo")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Open asset" })).toHaveAttribute("href", "/assets?asset=ast_logo");
    // Its trail: the project, its brand's type, then the brand it is part of.
    const trail = within(canvas.getByRole("navigation", { name: "Where it is" }));
    await userEvent.click(trail.getAllByRole("button", { name: "Acme" })[1]);
    await expect(getRouter().push).toHaveBeenCalledWith("/catalog?o=brd_acme", { scroll: false });
    await userEvent.click(canvas.getByRole("button", { name: "See lineage" }));
    await expect(getRouter().push).toHaveBeenLastCalledWith("/catalog?o=ast_logo&tab=lineage", { scroll: false });
    // Shared with Northwind already: nothing left to share it into.
    await expect(canvas.queryByRole("combobox", { name: "Share into" })).not.toBeInTheDocument();
  },
});

/** Stop sharing: the grant goes, and the page asks again. */
export const StopSharing = meta.story({
  args: { object: logo, folder: null },
  beforeEach: ({ msw }) => void msw.use(sent.on("delete", "/api/v1/grants/:id")),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Stop sharing with Northwind" }));
    await waitFor(() => expect(sent.last("DELETE")).toEqual({ path: "/api/v1/grants/grt_share_nw", body: null }));
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled());
  },
});

/** Share a brand into another project of the organization, in place under Shared with: its members read it as Viewers. */
export const ShareToProject = meta.story({
  args: { object: acmeBrand, folder: null },
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/grants")),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("combobox", { name: "Share into" })).toHaveTextContent("Northwind");
    await userEvent.click(canvas.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/grants", body: { project: "prj_northwind", resource: "brand", resourceId: "brd_acme", scope: "read" } }));
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled());
  },
});

/** Access, for an admin of its project: who reaches it and through what, and the grants made on it, each changed in place or taken back. */
export const Access = meta.story({
  args: { object: logo, folder: null, tab: "access" },
  beforeEach: ({ msw }) => void msw.use(sent.on("delete", "/api/v1/grants/:id"), sent.on("post", "/api/v1/grants")),
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByRole("heading", { name: "Granted on acme-logo.svg" })).toBeInTheDocument();
    // Grant someone: a person or a group, at the role picked beside it.
    await userEvent.click(canvas.getByRole("combobox", { name: "Person or group to grant" }));
    await userEvent.click(await screen.findByRole("option", { name: /Grace Hopper/ }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/grants", body: { user: "usr_grace", resource: "asset", resourceId: "ast_logo", scope: "read" } }));
    for (const who of ["Ada Lovelace", "Brand bot", "Northwind"]) await expect(canvas.getByRole("cell", { name: who })).toBeInTheDocument();
    await expect(canvas.getByRole("combobox", { name: "Linus Nakamura's role" })).toHaveTextContent("Viewer");
    await userEvent.click(canvas.getByRole("button", { name: "Take back Linus Nakamura's role" }));
    await waitFor(() => expect(sent.last("DELETE")).toEqual({ path: "/api/v1/grants/grt_linus_logo", body: null }));
  },
});

/** Someone not in the project: invited by email on this one asset, at the role picked. */
export const InviteByEmail = meta.story({
  args: { object: logo, folder: null, tab: "access" },
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/invitations", { url: "https://app.artbucket.test/invite/k3x", emailed: true })),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(await canvas.findByLabelText("Invite by email"), "lena@northwind.test");
    await userEvent.click(canvas.getByRole("button", { name: "Invite as Viewer" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/invitations", body: { email: "lena@northwind.test", resource: "asset", resourceId: "ast_logo", scope: "read" } }));
    await expect(await screen.findByText("lena@northwind.test is invited as Viewer on acme-logo.svg")).toBeInTheDocument();
  },
});

/** Access, for a viewer: who reaches it, and where grants are made instead of the form. */
export const AccessAsViewer = meta.story({
  args: { object: logo, folder: null, tab: "access" },
  parameters: { app: { scope: "read" } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("cell", { name: "Grace Hopper" })).toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "Granted on acme-logo.svg" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /Grant access in Acme/ })).toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: /Groups/ })).not.toBeInTheDocument();
  },
});

/** A site: its own access settings are on the site, linked from here; no activity tab. */
export const Site = meta.story({
  args: { object: portal, folder: null, tab: "access" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("link", { name: /Set who sees this site/ })).toHaveAttribute("href", "/sites/acme");
    await expect(canvas.queryByRole("button", { name: "activity" })).not.toBeInTheDocument();
  },
});

/** A rule, a part of its brand: the trail goes through the brand, and with no lineage only Overview and Access show. */
export const Part = meta.story({
  args: { object: primaryRule, folder: null },
  play: async ({ canvas }) => {
    const trail = within(canvas.getByRole("navigation", { name: "Where it is" }));
    await expect(trail.getByRole("button", { name: "Brands" })).toBeInTheDocument();
    await expect(trail.getAllByRole("button", { name: "Acme" })).toHaveLength(2);
    const tabs = within(canvas.getByRole("navigation", { name: "Object" }));
    await expect(tabs.getAllByRole("button").map((b) => b.textContent)).toEqual(["overview", "access"]);
  },
});

/** Activity: what happened to it, newest first, an agent's work among it. */
export const Activity = meta.story({
  args: { object: logo, folder: null, tab: "activity" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("uploaded version 3")).toBeInTheDocument();
    await expect(canvas.getByText("Brand bot")).toBeInTheDocument();
  },
});

/** A tab whose answer failed says so, in place. */
export const TabError = meta.story({
  args: { object: logo, folder: null, tab: "activity" },
  beforeEach: ({ msw }) => void msw.use(...catalogApi({ failing: true })),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("It answered 500")).toBeInTheDocument();
  },
});

/** A type's folder, for whoever may make one: New brand, and the way to every brand. */
export const Folder = meta.story({
  args: { folder: "prj_acme:brand" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Brands", level: 2 })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "New brand" })).toHaveAttribute("href", "/brands?new=brand");
    await expect(canvas.getByRole("link", { name: "All brands" })).toHaveAttribute("href", "/brands");
    await expect(canvas.getByRole("region", { name: "All brands" })).toBeInTheDocument();
  },
});

/** The same folder for a viewer: no New, since its form would refuse them. */
export const FolderAsViewer = meta.story({
  args: { folder: "prj_acme:brand" },
  parameters: { app: { scope: "read" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Brands", level: 2 })).toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "New brand" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "All brands" })).toBeInTheDocument();
  },
});

/** A folder in another project: New is the project open's only, so it isn't offered there. */
export const OtherProject = meta.story({
  args: { folder: "prj_northwind:collection" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Collections", level: 2 })).toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "New collection" })).not.toBeInTheDocument();
  },
});

/** A big folder shows its first hundred, then more on asking. */
export const ManyItems = meta.story({
  args: { projects: [{ ...treeProjects[0], objects: manyAssets(150) }], folder: "prj_acme:asset" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Show 50 more" }));
    await expect(canvas.getByText("photo-150.jpg")).toBeInTheDocument();
  },
});

/** A folder the tree no longer has (deleted since): said, with the tree to go elsewhere. */
export const Gone = meta.story({
  args: { folder: "prj_acme:component" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Nothing is here any more. Pick another place in the tree.")).toBeInTheDocument();
  },
});

/** Nothing reachable yet. */
export const Empty = meta.story({
  args: { projects: [], folder: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Nothing in the catalog you can reach yet/)).toBeInTheDocument();
  },
});

/** The tree folds away for room, and comes back. */
export const HideTheTree = meta.story({
  render: () => <CatalogPage projects={treeProjects} at="/catalog?o=ast_logo" />,
  globals: { viewport: { value: "laptop" } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Hide the tree" }));
    await expect(canvas.queryByRole("tree")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Show the tree" }));
    await expect(canvas.getByRole("tree")).toBeInTheDocument();
  },
});

/** On a phone the tree sits above the page. */
export const Phone = meta.story({ args: { object: logo, folder: null }, globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ args: { object: logo, folder: null }, globals: { theme: "dark" } });
