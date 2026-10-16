import preview from "#.storybook/preview";
import { catalogItems } from "#.storybook/fixtures/brands";
import { http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor } from "storybook/test";
import { CatalogMatches } from "@/components/catalog-matches";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { CatalogResults } from "@/lib/core/catalog";
import type { CatalogType } from "@/lib/catalog";

/** Everything the catalog holds, with a dozen rules so the type tabs and Show more have something to say. */
const others = [
  ...catalogItems,
  ...Array.from({ length: 12 }, (_, n) => ({ ...catalogItems.find((i) => i.id === "rul_primary")!, id: `rul_${n}`, slug: `color-${n}`, name: `Acme color ${n + 1}` })),
];

/** GET /api/v1/catalog as the core answers it: the types asked, a page of `limit` from `cursor`, counts per type. */
const answer = (items: typeof others, page = 40) =>
  http.get("/api/v1/catalog", ({ request }) => {
    const u = new URL(request.url);
    const types = u.searchParams.getAll("type") as CatalogType[];
    const cursor = Number(u.searchParams.get("cursor") ?? 0);
    const all = items.filter((i) => !types.length || types.includes(i.type));
    const counts: CatalogResults["counts"] = {};
    for (const i of all) counts[i.type] = (counts[i.type] ?? 0) + 1;
    const body: CatalogResults = {
      query: u.searchParams.get("q") ?? "",
      total: all.length,
      counts,
      projects: [{ slug: "acme", name: "Acme", count: all.length }],
      items: all.slice(cursor, cursor + page),
      hidden: { count: 0, example: null },
      next: cursor + page < all.length ? cursor + page : null,
      facets: { tags: [{ value: "press", count: 1 }], statuses: [{ value: "current", count: all.length }] },
    };
    return HttpResponse.json(body);
  });

/** Explore's search of every type: a row of types, the filters every type takes, then one ranked list, or every match of one type. */
const meta = preview.meta({
  title: "App/Features/Catalog/Matches",
  component: CatalogMatches,
  args: { q: "acme", only: null, assets: 128, narrow: { tags: [], statuses: [] }, onNarrow: fn(), onOpenAsset: fn() },
  argTypes: { only: { control: "select", options: [null, "asset", "brand", "collection", "site", "rule", "page", "component"] } },
  parameters: { nextjs: { navigation: { pathname: "/", query: { q: "acme" } } } },
  // NavLink closes the phone's sheet, so it reads the sidebar's state.
  decorators: [
    (Story) => (
      <SidebarProvider className="block min-h-0 space-y-6">
        <Story />
      </SidebarProvider>
    ),
  ],
  beforeEach: ({ msw }) => void msw.use(answer(others)),
});

/** Everything: a tab per type that matched, and one list of every type, assets among them, in rank order, a page at a time. */
export const Playground = meta.story({
  play: async ({ canvas, args, userEvent }) => {
    const nav = await canvas.findByRole("navigation", { name: "What to explore" });
    await expect(nav).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /^Everything/ })).toHaveAttribute("aria-current", "page");
    await expect(canvas.getByRole("link", { name: /^Assets 128/ })).toHaveAttribute("href", "/?q=acme&in=asset");
    await expect(canvas.getByRole("link", { name: /^Rules 13/ })).toHaveAttribute("href", "/?q=acme&in=rule");
    const list = canvas.getByRole("region", { name: "Results" });
    // Each opens where the app shows it: a brand its page, not the catalog's.
    await expect(list.querySelector('a[href^="/brands/acme?"]')).not.toBeNull();
    // Tags narrow every type, as they narrow the assets.
    await userEvent.click(canvas.getByRole("button", { name: /Tags/ }));
    await userEvent.click(await screen.findByRole("option", { name: /press/ }));
    await expect(args.onNarrow).toHaveBeenCalledWith({ tags: ["press"], statuses: [] });
  },
});

/** Every card's ⋯, and its right click: the same few things whatever its type, and Download for an asset. */
export const Menu = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "More for Acme" }));
    for (const name of ["Open", "Open in catalog", "Copy link", "Copy address", "Pin to the sidebar"]) await expect(await screen.findByRole("menuitem", { name })).toBeInTheDocument();
    await expect(screen.queryByRole("menuitem", { name: "Download" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  },
});

/** One type picked (?in=rule): every match, a page at a time. */
export const OneType = meta.story({
  args: { only: "rule" },
  beforeEach: ({ msw }) => void msw.use(answer(others, 10)),
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByRole("link", { name: /^Rules 13/ })).toHaveAttribute("aria-current", "page");
    await expect(await canvas.findByText("Acme color 9")).toBeInTheDocument();
    await expect(canvas.queryByText("Acme color 12")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Show more" }));
    await expect(await canvas.findByText("Acme color 12")).toBeInTheDocument();
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument());
  },
});

/** A type picked that has nothing for these words: its tab stays, and says so. */
export const NoneOfType = meta.story({
  args: { only: "component" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No components match.")).toBeInTheDocument();
  },
});

/** Assets picked: the tabs only, the grid below is the assets'. */
export const AssetsPicked = meta.story({
  args: { only: "asset" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("link", { name: /^Assets 128/ })).toHaveAttribute("aria-current", "page");
    await expect(canvas.queryByRole("region", { name: "Results" })).not.toBeInTheDocument();
  },
});

/** Nothing matched: the tabs stay, and the list says so. */
export const Nothing = meta.story({
  beforeEach: ({ msw }) => void msw.use(answer([])),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No results match.")).toBeInTheDocument();
  },
});

/** Long names truncate on their cards. */
export const LongNames = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      answer([
        { ...others[0], name: "Acme International Holdings Partner Programme for Resellers" },
        { ...others[2], name: "Spring launch 2026 assets for every reseller and partner in the region" },
      ]),
    ),
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
