import preview from "#.storybook/preview";
import { brandRows, hub, IMPORTER, importer, manyRows, offers } from "#.storybook/fixtures/brand-pages";
import { assetFiles, recorder } from "#.storybook/fixtures/brands";
import { inApp } from "#.storybook/fixtures/library";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, screen, waitFor, within } from "storybook/test";
import { BrandsPage } from "@/components/brands";

const LAYOUT = "artbucket:brands-layout";
const sent = recorder();

/**
 * The Brands page: every brand of the project as a card (or a row), who sees it on BrandHub, its last release and
 * the portal it links, with New brand for whoever may make one. The list is where BrandHub is set: public or private,
 * and which portal it links as the guidelines.
 */
const meta = preview.meta({
  title: "App/Features/Brands/Brands page",
  component: BrandsPage,
  args: { brands: brandRows, canShare: true, canEdit: true, q: "", offers: [], create: false },
  parameters: { layout: "fullscreen" },
  decorators: [inApp],
  beforeEach: ({ msw }) => {
    sent.reset();
    msw.use(assetFiles, sent.on("patch", "/api/v1/brands/:slug/hub", hub()));
    // The layout is this browser's: cards before each story, and whatever was there put back after.
    let was: string | null = null;
    try {
      was = localStorage.getItem(LAYOUT);
      localStorage.removeItem(LAYOUT);
    } catch {}
    return () => {
      try {
        if (was === null) localStorage.removeItem(LAYOUT);
        else localStorage.setItem(LAYOUT, was);
      } catch {}
    };
  },
});

/** A few brands as cards: Acme public and the default, Northwind never released, one with no BrandHub. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Brands" })).toBeInTheDocument();
    const list = within(canvas.getByRole("list", { name: "Every brand" }));
    await expect(list.getAllByRole("link", { name: /Acme/ })[0]).toHaveAttribute("href", "/brands/acme");
    await expect(canvas.getByText("@12, released 2 days ago")).toBeInTheDocument();
    await expect(canvas.getByText("Never released")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /New brand/ })).toBeInTheDocument();
  },
});

/** A project without a brand yet. */
export const Empty = meta.story({
  args: { brands: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No brand here.")).toBeInTheDocument();
  },
});

/** Many brands: four to a row on a laptop, the first two rows loading their heading face. */
export const Many = meta.story({ args: { brands: manyRows(14) } });

/** Find a brand by its name, and Public or Private to narrow it; nothing found says what was asked. */
export const FindAndFilter = meta.story({
  args: { brands: manyRows(8) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Find a brand" }), "tail");
    const found = () => canvas.getByRole("list", { name: "Matching brands" });
    await expect(within(found()).getAllByRole("heading", { level: 3 })).toHaveLength(1);
    await userEvent.clear(canvas.getByRole("textbox", { name: "Find a brand" }));
    await userEvent.click(canvas.getByRole("radio", { name: "Private" }));
    await expect(found()).not.toHaveTextContent("Public");
    await userEvent.click(canvas.getByRole("radio", { name: "All" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "Find a brand" }), "zebra");
    await expect(canvas.getByText('No brand matches "zebra".')).toBeInTheDocument();
  },
});

/** Opened from a brand's Settings with its name in the search. */
export const Searched = meta.story({ args: { q: "north" } });

/** The list: a row each, with BrandHub's actions. The choice is kept for this browser. */
export const List = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "List" }));
    await expect(await canvas.findByRole("button", { name: /Make private/ })).toBeInTheDocument();
    await expect(localStorage.getItem(LAYOUT)).toBe("list");
    // Never released: nothing on BrandHub to make public yet.
    await expect(canvas.getByRole("button", { name: /Make public/ })).toBeDisabled();
    await expect(canvas.getByText("Never released: BrandHub shows it once it is")).toBeInTheDocument();
  },
});

/** Make public asks first, then PATCHes BrandHub's visibility and reads the page again. */
export const MakePublic = meta.story({
  args: { brands: [{ ...brandRows[0], visibility: "private" as const, hub: hub() }, brandRows[1]] },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "List" }));
    const row = within(within(canvas.getByRole("list", { name: "Every brand" })).getAllByRole("listitem")[0]);
    await userEvent.click(row.getByRole("button", { name: /Make public/ }));
    const dialog = await screen.findByRole("alertdialog", { name: "Make Acme public?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Make public" }));
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/brands/acme/hub", body: { visibility: "public" } }));
    await expect(await screen.findByText("Acme is public on BrandHub")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await expect(getRouter().refresh).toHaveBeenCalled();
  },
});

/** Make private takes effect at once: it hides the brand, never shows more. */
export const MakePrivate = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "List" }));
    await userEvent.click(await canvas.findByRole("button", { name: /Make private/ }));
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/brands/acme/hub", body: { visibility: "private" } }));
    await expect(await screen.findByText("Acme is private again")).toBeInTheDocument();
  },
});

/** The portal BrandHub links as the guidelines: its first public one, or one picked from the row's menu. */
export const PickTheLinkedPortal = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "List" }));
    await userEvent.click(await canvas.findByRole("button", { name: "More for Acme" }));
    await expect(await screen.findByRole("menuitemradio", { name: /Acme brand portal/ })).toBeChecked();
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Partner portal/ }));
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/brands/acme/hub", body: { portal: "partners" } }));
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  },
});

/** Someone who reads: no New brand, and BrandHub's status without its buttons. */
export const Viewer = meta.story({
  args: { canShare: false, canEdit: false },
  parameters: { app: { scope: "read" } },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole("button", { name: /New brand/ })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("radio", { name: "List" }));
    await expect(canvas.queryByRole("button", { name: /Make p/ })).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /BrandHub/ })).toHaveAttribute("href", "https://hub.artbucket.test/acme/acme");
  },
});

/** No BrandHub on this server: no Public or Private filter, no badges. */
export const NoBrandHub = meta.story({
  args: { brands: brandRows.map((b) => ({ ...b, hub: null })) },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("radio", { name: "Public" })).not.toBeInTheDocument();
  },
});

/** A listing on BrandHub that the organization's verified domain claims: offered to its admins above the list. */
export const WithOffers = meta.story({ args: { offers } });

/**
 * ?new=brand: opened on New brand, the address cleaned so a reload doesn't open it again. A new brand opens on its
 * Overview.
 */
export const OpenOnNewBrand = meta.story({
  args: { create: true },
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/brands", { id: "brd_kids", slug: "acme-kids", name: "Acme Kids", default: false, rules: 0 })),
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "New brand" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    await userEvent.type(await screen.findByRole("textbox", { name: "Name" }), "Acme Kids");
    await userEvent.click(screen.getByRole("button", { name: "Create brand" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/brands/acme-kids"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** Discarded, then opened again: New brand starts afresh, not on the name typed before. */
export const NewBrandStartsAfresh = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /New brand/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await userEvent.type(await screen.findByRole("textbox", { name: "Name" }), "Acme Kids");
    await userEvent.keyboard("{Escape}");
    // Esc leaves the field first, then asks.
    await userEvent.keyboard("{Escape}");
    await userEvent.click(await screen.findByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(await canvas.findByRole("button", { name: /New brand/ }));
    await expect(await screen.findByRole("radiogroup", { name: "How to set it up" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** Where the server imports brands: Imports beside New brand, and what is at work said above the list. */
export const WithBrandImport = meta.story({
  parameters: { app: { me: { brandImport: IMPORTER } } },
  beforeEach: ({ msw }) => void msw.use(...importer(null)),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /Imports/ })).toHaveAttribute("href", "/imports");
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" } });

