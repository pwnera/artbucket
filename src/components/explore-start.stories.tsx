import preview from "#.storybook/preview";
import { NOW } from "#.storybook/fixtures/brands";
import { collections, inApp, renditions } from "#.storybook/fixtures/library";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";
import { ExploreStart } from "@/components/explore-start";

const RECENTS = "artbucket:recents:prj_acme";
const QUERIES = "artbucket:recent-queries";
const minutes = (n: number) => NOW.getTime() - n * 60_000;

/** What Ada opened lately in Acme: a brand, a collection and an asset. */
const recents = [
  { kind: "brand", id: "brd_acme", label: "Acme", href: "/brands/acme", at: minutes(20) },
  { kind: "collection", id: "col_campaign", label: "Autumn campaign", href: "/assets?collection=col_campaign", at: minutes(90) },
  { kind: "asset", id: "ast_hero", label: "Autumn campaign hero", href: "/assets?asset=ast_hero", at: minutes(180) },
];

/** Added lately, as the first page of assets lists them. */
const latest = [
  { id: "ast_hero", filename: "autumn-campaign-hero.jpg", createdAt: "2026-09-02T09:00:00Z", metadata: { title: "Autumn campaign hero" } },
  { id: "ast_logo", filename: "acme-logo.svg", createdAt: "2026-09-01T09:00:00Z" },
  { id: "ast_brief", filename: "brand-brief-2026.pdf", createdAt: "2026-08-28T09:00:00Z" },
];

// On Home, its links go through the router to Assets.
const went = (href: string) => expect(getRouter().push).toHaveBeenCalledWith(href);

/** Seed this browser's preferences for a story, and put them back after. */
const prefs = (values: Record<string, unknown>) => () => {
  const kept = [RECENTS, QUERIES].map((k) => [k, localStorage.getItem(k)] as const);
  for (const [k] of kept) localStorage.removeItem(k);
  for (const [k, v] of Object.entries(values)) localStorage.setItem(k, JSON.stringify(v));
  // Swapped by hand: a spy on Date.now recurses (the spy times its own calls with it).
  const realNow = Date.now;
  Date.now = () => NOW.getTime();
  return () => {
    Date.now = realNow;
    for (const [k, v] of kept) {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    }
  };
};

/** Home (/): one box that searches everything, the types to browse, then what is yours lately. */
const meta = preview.meta({
  title: "App/Features/Catalog/Home",
  component: ExploreStart,
  args: { latest, collections, searches: [], setup: null },
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/" } } },
  // In the app: the project's brands come from its shell (Acme, as the sidebar lists it).
  decorators: [inApp],
  beforeEach: async ({ msw }) => {
    msw.use(...renditions);
    return prefs({ [RECENTS]: recents, [QUERIES]: ["logo dark", "autumn"] })();
  },
});

/** A returning editor: what they opened lately comes first, each with why. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Welcome to Acme" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Acme Brand · opened 20m ago/ })).toBeInTheDocument();
    await expect(canvas.getByText("You opened it 3 hours ago")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /All in the catalog/ })).toHaveAttribute("href", "/catalog");
  },
});

/** Typing and Enter searches everything. */
export const Search = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search everything" }), "press kit{Enter}");
    await went("/assets?q=press%20kit");
  },
});

/** Focused and empty, the box drops down what was searched lately; each can be run again or forgotten. */
export const RecentSearches = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("searchbox", { name: "Search everything" }));
    await userEvent.click(canvas.getByRole("button", { name: "Forget autumn" }));
    await waitFor(() => expect(canvas.queryByRole("button", { name: "autumn" })).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole("button", { name: "logo dark" }));
    await went("/assets?q=logo%20dark");
  },
});

/** A type to browse, and an asset opened from the list, by mouse or keyboard. */
export const Browse = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Rules" }));
    await went("/assets?in=rule");
    canvas.getByText("acme-logo.svg").closest("tr")!.focus();
    await userEvent.keyboard("{Enter}");
    await went("/assets?browse&asset=ast_logo");
  },
});

/** A new project: no brand, nothing opened, nothing added, no collections. Only the box and the types. */
export const Empty = meta.story({
  args: { latest: [], collections: [] },
  parameters: { app: { sidebar: { brands: [], collections: [] } } },
  beforeEach: prefs({}),
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("region", { name: "Brands and collections" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("region", { name: "Assets for you" })).not.toBeInTheDocument();
  },
});

/** Long names truncate in their cards and rows. */
export const LongNames = meta.story({
  args: {
    latest: [{ id: "ast_long", filename: "acme-international-holdings-partner-programme-reseller-toolkit-final-v12.pdf", createdAt: "2026-09-01T09:00:00Z" }],
    collections: [{ ...collections[0], name: "Acme International Holdings Partner Programme for Resellers, autumn edition" }],
  },
  beforeEach: prefs({}),
});

/** Someone new: nothing opened yet, and the project's brands come before its collections. */
export const NewMember = meta.story({
  beforeEach: prefs({}),
  play: async ({ canvas }) => {
    const cards = within(canvas.getByRole("region", { name: "Brands and collections" })).getAllByRole("button");
    await expect(cards[0]).toHaveAccessibleName(/^Acme Brand/);
    await expect(cards[1]).toHaveAccessibleName(new RegExp(`^${collections[0].name} Collection`));
  },
});

/** A viewer sees the same start: it only opens things. */
export const Viewer = meta.story({ parameters: { app: { scope: "read" } } });

/** On a phone the list keeps only the names. */
export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
