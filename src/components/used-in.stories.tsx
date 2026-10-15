import preview from "#.storybook/preview";
import { delay, http, HttpResponse } from "msw";
import { expect, fn } from "storybook/test";
import { UsedIn } from "@/components/used-in";

const data = {
  days: 30,
  rules: [
    { brand: "acme", key: "logo.primary", label: "Primary logo", context: null },
    { brand: "acme", key: "logo.primary", label: "Primary logo", context: "dark-background" },
  ],
  pages: [{ brand: { slug: "acme", name: "Acme", default: true }, slug: "logo", title: "Logo" }],
  portals: [{ name: "Press portal", url: "https://press.acme.test" }],
  fetches: { total: 18_400, surfaces: { portal: 9_800, api: 4_100, mcp: 3_200, app: 1_300 } },
  referrers: [
    { host: "shop.northwind.test", fetches: 2_100, last: "2026-10-14" },
    { host: "news.acme.test", fetches: 640, last: "2026-10-12" },
  ],
};

/**
 * Where an asset is used (UsedIn), folded in its panel: the rules and pages that show it, the public portals it is
 * on, and how it was fetched lately, by surface and by the sites that load it. A link saves what is typed first.
 */
const meta = preview.meta({
  title: "App/Features/Library/Used in",
  component: UsedIn,
  decorators: [(Story) => <div className="w-96">{Story()}</div>],
  args: { assetId: "ast_logo", leave: fn((next: () => void) => next()) },
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/assets/:id/insights", () => HttpResponse.json({ data }))),
});

/** Unfolded: rules, a page, a portal, fetches by surface, top referrers. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(await canvas.findByText("2 rules · 1 page · 1 portal · 18,400 fetches"));
    await expect(canvas.getByText("shop.northwind.test")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("link", { name: "Logo" }));
    await expect(args.leave).toHaveBeenCalled();
  },
});

/** Used nowhere yet. */
export const Unused = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(http.get("/api/v1/assets/:id/insights", () => HttpResponse.json({ data: { days: 30, rules: [], pages: [], portals: [], fetches: { total: 0, surfaces: {} }, referrers: [] } }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("0 fetches")).toBeInTheDocument();
  },
});

/** Loading: its line holds, so the panel doesn't jump. */
export const Loading = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/assets/:id/insights", async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    ),
});

/** It couldn't load: Retry asks again. */
export const Failed = meta.story({
  beforeEach: ({ msw }) => {
    let calls = 0;
    msw.use(http.get("/api/v1/assets/:id/insights", () => (++calls === 1 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json({ data }))));
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByText("Used in"));
    await userEvent.click(await canvas.findByRole("button", { name: "Retry" }));
    await expect(await canvas.findByText(/18,400 fetches/)).toBeInTheDocument();
  },
});
