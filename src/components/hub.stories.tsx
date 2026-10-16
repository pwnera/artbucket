import preview from "#.storybook/preview";
import { assetFiles, freezeNow } from "#.storybook/fixtures/brands";
import { hubCards } from "#.storybook/fixtures/catalog";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { useEffect, useState } from "react";
import { expect, waitFor, within } from "storybook/test";
import { Avatar, Cards, Dots, Owner, Private, Pulls, TabNav } from "@/components/hub";
import { HubSearch } from "@/components/hub-client";

const FILTERS = { all: "All brands", verified: "Verified", community: "Community", private: "Private" } as const;
type Filter = keyof typeof FILTERS;

/**
 * BrandHub's front page below its hero (app/hub/page.tsx): the search, the tabs that filter, and the listings as
 * cards. The address is kept here, so a search or a tab picks the next cards as the server would.
 */
function HubHome({ at, cards: all = hubCards }: { at: string; cards?: typeof hubCards }) {
  const [url, setUrl] = useState(at);
  useEffect(() => void getRouter().push.mockImplementation((u: string) => setUrl(u)), []);
  const sp = new URL(url, "https://hub.artbucket.test").searchParams;
  const q = (sp.get("q") ?? "").toLowerCase();
  const filter = (sp.get("filter") ?? "all") as Filter;
  const found = all.filter((c) => !q || c.name.toLowerCase().includes(q) || c.org.includes(q));
  const of: Record<Filter, typeof found> = {
    all: found,
    verified: found.filter((c) => c.visibility === "public" && c.verified),
    community: found.filter((c) => c.visibility === "public" && !c.verified),
    private: found.filter((c) => c.visibility === "private"),
  };
  const href = (f: Filter) => `/hub?${new URLSearchParams({ ...(q && { q }), ...(f !== "all" && { filter: f }) })}`.replace(/\?$/, "");
  const cards = of[filter];
  return (
    // Storybook's next/link only records a click, and its next/form is the pages router's, which with no router
    // submits natively: both are taken here and pushed, as the app router would.
    <div
      className="mx-auto grid max-w-7xl gap-6 px-4 py-8"
      onClick={(e) => {
        const a = (e.target as Element).closest("a");
        if (a) getRouter().push(a.getAttribute("href")!);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        getRouter().push(`/hub?${new URLSearchParams(new FormData(e.target as HTMLFormElement) as unknown as Record<string, string>)}`);
      }}
    >
      <HubSearch key={q} action="/hub" defaultValue={q} big className="max-w-xl" />
      <div className="border-b">
        <TabNav label="Show" items={(Object.keys(FILTERS) as Filter[]).map((f) => ({ href: href(f), label: FILTERS[f], count: of[f].length, current: f === filter }))} />
      </div>
      {q && (
        <p className="text-muted-foreground text-sm">
          {cards.length} {cards.length === 1 ? "result" : "results"} for <b className="text-foreground">{q}</b>
        </p>
      )}
      {cards.length ? <Cards cards={cards} base="/hub" /> : <p className="text-muted-foreground py-20 text-center">No brand matches &quot;{q}&quot;</p>}
    </div>
  );
}

/**
 * BrandHub's listings (hub.artbucket.io): each brand as a card, its mark on its own ground, its colors, who listed
 * it (verified, community or private), its release and its pulls. The whole card is the link.
 */
const meta = preview.meta({
  title: "App/Features/Hub/Listings",
  component: Cards,
  args: { cards: hubCards, base: "/hub" },
  parameters: { nextjs: { navigation: { pathname: "/hub" } } },
  beforeEach: ({ msw }) => {
    msw.use(assetFiles);
    return freezeNow();
  },
});

/** A verified brand with its logo and palette, a community listing, a private one and a long name. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Acme" })).toHaveAttribute("href", "/hub/acme/acme");
    await expect(canvas.getByText("acme.test")).toBeInTheDocument();
    await expect(canvas.getAllByText("May not come from the brand's owner.")).toHaveLength(2);
    await expect(canvas.getByText("1.3k pulls")).toBeInTheDocument();
    await expect(canvas.getByText("2 days ago")).toBeInTheDocument();
    // Each color named, for whoever can't see the dots.
    await expect(within(canvas.getAllByRole("list", { name: "Colors" })[0]).getByText("Acme Blue")).toBeInTheDocument();
  },
});

/** Search, then filter by tab, then open a brand: what the hub's front page does, with the keyboard's `/` to search. */
export const FilterAndOpen = meta.story({
  render: () => <HubHome at="/hub" />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.keyboard("/");
    const search = canvas.getByRole("searchbox", { name: "Search brands and owners" });
    await expect(search).toHaveFocus();
    await userEvent.type(search, "acme{Enter}");
    await expect(await canvas.findByText(/results for/)).toHaveTextContent("2 results for acme");
    await userEvent.click(canvas.getByRole("link", { name: /^Verified/ }));
    await waitFor(() => expect(canvas.getByRole("link", { name: /^Verified/ })).toHaveAttribute("aria-current", "page"));
    await expect(canvas.queryByRole("link", { name: /Acme International/ })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("link", { name: "Acme" }));
    await expect(getRouter().push).toHaveBeenLastCalledWith("/hub/acme/acme");
  },
});

/** A search with nothing to show. */
export const NoMatch = meta.story({
  render: () => <HubHome at="/hub?q=zzz" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No brand matches "zzz"')).toBeInTheDocument();
  },
});

/** Who listed it, as cards and the listing's About say it. */
export const Badges = meta.story({
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Owner verified="acme.test" />
      <Owner verified={null} />
      <Private />
      <Pulls n={1} />
      <Pulls n={48_210} />
      <Dots colors={["#2f62ff", "#0b1020", "#ff5b1f"]} />
      <Avatar name="Acme" logo="/a/ast_logo/h_240,f_webp" tint="#2f62ff" className="size-8 text-3xl" />
      <Avatar name="Northwind" tint="#14a874" className="size-8 text-3xl" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Community")).toHaveAttribute("title", "Not verified as the brand's owner");
    await expect(canvas.getByText(/48\.2k pulls/)).toBeInTheDocument();
  },
});

/** The listing's own tabs, the current one marked. */
export const Tabs = meta.story({
  render: () => (
    <div className="border-b">
      <TabNav
        label="Acme"
        items={[
          { href: "#top", label: "Overview", current: true },
          { href: "#colors", label: "Colors", count: 4 },
          { href: "#type", label: "Type", count: 1 },
          { href: "#versions", label: "Releases", count: 12 },
        ]}
      />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  },
});

/** Nothing listed yet. */
export const Empty = meta.story({ args: { cards: [] } });

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" } });

/**
 * As artbucket.io frames it (`globals=fixture:artbucket`): the front page's search and tabs over the cards, with our
 * own names, live to search and filter. The long name is a layout test, left out here.
 */
export const OnArtbucket = meta.story({
  args: { cards: hubCards.slice(0, 3) },
  globals: { fixture: "artbucket" },
  render: ({ cards }) => <HubHome at="/hub" cards={cards} />,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("link", { name: "Artbucket" })).toHaveAttribute("href", "/hub/artbucket/artbucket");
    await expect(canvas.getByText("artbucket.io")).toBeInTheDocument();
    await expect(canvasElement).not.toHaveTextContent(/acme/i);
  },
});
