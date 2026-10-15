import preview from "#.storybook/preview";
import { catalogItems, longBrand, me, project, treeProjects, viewer, withMe } from "#.storybook/fixtures/brands";
import { expect, fn, waitFor } from "storybook/test";
import { CatalogTree } from "@/components/catalog-tree";

/** The catalog's tree (/catalog, left): projects, a folder per type, then objects. Arrow keys move and fold, Enter opens. */
const meta = preview.meta({
  title: "App/Features/Catalog/Tree",
  component: CatalogTree,
  args: { projects: treeProjects, current: null, onOpen: fn(), onOpenFolder: fn(), onHide: fn() },
  argTypes: { current: { control: "text" } },
  decorators: [
    withMe(me),
    (Story) => (
      <div className="h-[560px] w-80 border">
        <Story />
      </div>
    ),
  ],
});

/** Projects start unfolded, the rest folded: Right opens a folder, Left closes it, Up and Down move, Enter opens. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const acme = canvas.getByRole("treeitem", { name: /^Acme/ });
    await expect(acme).toHaveAttribute("aria-expanded", "true");
    acme.focus();
    await userEvent.keyboard("{ArrowDown}");
    const brandsFolder = canvas.getByRole("treeitem", { name: /^Brands/ });
    await expect(brandsFolder).toHaveFocus();
    await expect(brandsFolder).toHaveAttribute("aria-expanded", "false");
    await userEvent.keyboard("{ArrowRight}");
    await expect(brandsFolder).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{ArrowDown}");
    const brand = canvas.getByRole("treeitem", { name: /^Acme @12/ });
    await expect(brand).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onOpen).toHaveBeenCalledWith("brd_acme");
    // Left on a leaf goes up to its folder, then folds it.
    await userEvent.keyboard("{ArrowDown}{ArrowLeft}");
    await expect(brandsFolder).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(brandsFolder).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByRole("treeitem", { name: /^Northwind draft/ })).not.toBeInTheDocument();
    await userEvent.keyboard("{ArrowUp}");
    await expect(acme).toHaveFocus();
  },
});

/** Clicking a folder opens its page; its chevron only folds it. */
export const OpenFolder = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("treeitem", { name: /^Collections 2/ }));
    await expect(args.onOpenFolder).toHaveBeenCalledWith("prj_acme:collection");
  },
});

/** An object open in the catalog: the path down to it is unfolded and the row marked. */
export const ObjectOpen = meta.story({
  args: { current: "pag_logo" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("treeitem", { name: "Logo" })).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByRole("treeitem", { name: /^Guideline pages/ })).toHaveAttribute("aria-expanded", "true");
  },
});

/** Assets fold once more, by their type: images, videos. */
export const AssetsByType = meta.story({
  args: { current: "ast_film" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("treeitem", { name: /^Videos 1/ })).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByRole("treeitem", { name: "launch-film.mp4" })).toHaveAttribute("aria-selected", "true");
  },
});

/** The filter unfolds whatever matches, by name or address. */
export const Filtered = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("searchbox", { name: "Filter the tree" }), "hero");
    await expect(await canvas.findByRole("treeitem", { name: "hero-spring.jpg" })).toBeInTheDocument();
    await expect(canvas.queryByRole("treeitem", { name: /^Press kit/ })).not.toBeInTheDocument();
    await userEvent.clear(canvas.getByRole("searchbox"));
    await userEvent.type(canvas.getByRole("searchbox"), "nothing like it");
    await expect(await canvas.findByText("Nothing matches.")).toBeInTheDocument();
  },
});

/** A project with nothing in it yet. */
export const Empty = meta.story({
  args: { projects: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Nothing here yet.")).toBeInTheDocument();
  },
});

/** A type's folder offers New in the project open, and where its things are managed, on hover or focus. */
export const FolderActions = meta.story({
  play: async ({ canvas }) => {
    canvas.getByRole("treeitem", { name: /^Brands/ }).focus();
    await expect(canvas.getByRole("link", { name: "New brand" })).toHaveAttribute("href", "/brands?new=brand");
    await expect(canvas.getByRole("link", { name: "All brands" })).toHaveAttribute("href", "/brands");
  },
});

/** A viewer: where things are managed, never New. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    canvas.getByRole("treeitem", { name: /^Brands/ }).focus();
    await expect(canvas.getByRole("link", { name: "All brands" })).toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "New brand" })).not.toBeInTheDocument();
  },
});

/** Long names truncate on one line; private ones carry a lock, shared ones say so. */
export const LongNames = meta.story({
  args: {
    current: longBrand.id,
    projects: [
      {
        ...treeProjects[0],
        objects: [
          ...catalogItems,
          { ...catalogItems[0], id: longBrand.id, slug: longBrand.slug, name: longBrand.name, private: true, release: 3 },
          { ...catalogItems[2], id: "col_shared", slug: "partner-assets", name: "Partner assets shared with every reseller", sharedFrom: { id: "prj_northwind", name: "Northwind" } },
        ],
      },
    ],
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByLabelText("Private")).toBeInTheDocument();
    canvas.getByRole("treeitem", { name: /^Collections/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByTitle("Shared from Northwind")).toBeInTheDocument();
  },
});

/** Hide the tree gives the object's page the room. */
export const Hide = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Hide the tree" }));
    await waitFor(() => expect(args.onHide).toHaveBeenCalledOnce());
    await expect(canvas.getByRole("treeitem", { name: new RegExp(`^${project.name}`) })).toBeInTheDocument();
  },
});
