import preview from "#.storybook/preview";
import { me, NOW, viewer, withMe } from "#.storybook/fixtures/brands";
import { collections, renditions } from "#.storybook/fixtures/library";
import { expect, fn, spyOn, waitFor } from "storybook/test";
import { ExploreStart } from "@/components/explore-start";

const RECENTS = "artbucket:recents:prj_acme";
const QUERIES = "artbucket:recent-queries";
const minutes = (n: number) => NOW.getTime() - n * 60_000;

/** What Ada opened lately in Acme: a brand, a collection and an asset. */
const recents = [
  { kind: "brand", id: "brd_acme", label: "Acme", href: "/brands/acme", at: minutes(20) },
  { kind: "collection", id: "col_campaign", label: "Autumn campaign", href: "/?collection=col_campaign", at: minutes(90) },
  { kind: "asset", id: "ast_hero", label: "Autumn campaign hero", href: "/?asset=ast_hero", at: minutes(180) },
];

/** Added lately, as Explore's first page of assets lists them. */
const latest = [
  { id: "ast_hero", filename: "autumn-campaign-hero.jpg", createdAt: "2026-09-02T09:00:00Z", metadata: { title: "Autumn campaign hero" } },
  { id: "ast_logo", filename: "acme-logo.svg", createdAt: "2026-09-01T09:00:00Z" },
  { id: "ast_brief", filename: "brand-brief-2026.pdf", createdAt: "2026-08-28T09:00:00Z" },
];

const pushed = fn();
const went = (href: string) => expect(pushed).toHaveBeenCalledWith(null, "", href);

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

/** Explore before anything is asked (/): one box that searches everything, the types to browse, then what is yours lately. */
const meta = preview.meta({
  title: "App/Features/Catalog/Explore start",
  component: ExploreStart,
  args: { latest, collections, searches: [], setup: null },
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/" } } },
  decorators: [withMe(me)],
  beforeEach: async ({ msw }) => {
    msw.use(...renditions);
    // On Explore, its links move within the page (pushState), not through the router: caught here, so the frame stays put.
    pushed.mockClear();
    const push = spyOn(window.history, "pushState").mockImplementation((...a) => void pushed(...a));
    const restore = prefs({ [RECENTS]: recents, [QUERIES]: ["logo dark", "autumn"] })();
    return () => {
      push.mockRestore();
      restore();
    };
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
    await went("/?q=press%20kit");
  },
});

/** Focused and empty, the box drops down what was searched lately; each can be run again or forgotten. */
export const RecentSearches = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("searchbox", { name: "Search everything" }));
    await userEvent.click(canvas.getByRole("button", { name: "Forget autumn" }));
    await waitFor(() => expect(canvas.queryByRole("button", { name: "autumn" })).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole("button", { name: "logo dark" }));
    await went("/?q=logo%20dark");
  },
});

/** A type to browse, and an asset opened from the list, by mouse or keyboard. */
export const Browse = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Rules" }));
    await went("/?in=rule");
    canvas.getByText("acme-logo.svg").closest("tr")!.focus();
    await userEvent.keyboard("{Enter}");
    await went("/?browse&asset=ast_logo");
  },
});

/** A new project: nothing opened, nothing added, no collections. Only the box and the types. */
export const Empty = meta.story({
  args: { latest: [], collections: [] },
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

/** A viewer sees the same start: it only opens things. */
export const Viewer = meta.story({ decorators: [withMe(viewer)] });

/** On a phone the list keeps only the names. */
export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
