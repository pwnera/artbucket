import preview from "#.storybook/preview";
import { catalogItems } from "#.storybook/fixtures/brands";
import { delay, http, HttpResponse } from "msw";
import { expect, waitFor } from "storybook/test";
import { CatalogMatches } from "@/components/catalog-matches";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { CatalogResults } from "@/lib/core/catalog";
import type { CatalogType } from "@/lib/catalog";

/** Everything the catalog holds besides assets, with a dozen rules so "and N more" and Show more have something to say. */
const others = [
  ...catalogItems.filter((i) => i.type !== "asset"),
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
    };
    return HttpResponse.json(body);
  });

/** What else a search in Explore finds, above the assets: a row of types, then a first look at each, or every match of one. */
const meta = preview.meta({
  title: "App/Features/Catalog/Matches",
  component: CatalogMatches,
  args: { q: "acme", only: null, assets: 128 },
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

/** Everything: a tab per type that matched, and the first eight across them. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    const nav = await canvas.findByRole("navigation", { name: "What to explore" });
    await expect(nav).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Everything" })).toHaveAttribute("aria-current", "page");
    await expect(canvas.getByRole("link", { name: /^Assets 128/ })).toHaveAttribute("href", "/?q=acme&in=asset");
    await expect(canvas.getByRole("link", { name: /^Rules 13/ })).toHaveAttribute("href", "/?q=acme&in=rule");
    await expect(canvas.getByRole("link", { name: "Acme Brand · Acme" })).toHaveAttribute("href", "/catalog?o=brd_acme");
    await expect(canvas.getByText(/and \d+ more: pick a type above to see them all/)).toBeInTheDocument();
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
    await expect(canvas.queryByRole("region", { name: "Brands, collections and more" })).not.toBeInTheDocument();
  },
});

/** Nothing but assets matched: nothing shows, so the assets stand alone. */
export const Hidden = meta.story({
  beforeEach: ({ msw }) => void msw.use(answer([])),
  play: async ({ canvas }) => {
    await delay(400);
    await expect(canvas.queryByRole("navigation")).not.toBeInTheDocument();
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
