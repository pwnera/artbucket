import preview from "#.storybook/preview";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, waitFor } from "storybook/test";
import { publicItems, renditions } from "#.storybook/fixtures/library";
import { deriveTheme } from "@/lib/brand-theme";
import { PortalAssets, type AssetsView } from "@/components/portal-assets";

const items = publicItems.map((i) => ({ ...i, original: undefined, downloads: i.downloads.map((d) => ({ ...d, preset: d.label.toLowerCase() })) }));

const view = (over: Partial<AssetsView["portal"]> = {}, data = items, total = data.length): AssetsView => ({
  portal: {
    slug: "press",
    name: "Acme press",
    intro: "Logos, photography and the brand reel, cleared for editorial use.",
    organization: "Acme Inc",
    access: "public",
    expiresAt: null,
    theme: { logo: null, accent: "#2f62ff", background: null },
    collections: [
      { id: "col_logos", name: "Logos", count: 14, covers: ["/a/ast_logo/w_640,f_webp", "/a/ast_mark/w_640,f_webp", "/a/ast_old_logo/w_640,f_webp"] },
      { id: "col_campaign", name: "Autumn campaign", count: 128, covers: ["/a/ast_hero/w_640,f_webp", "/a/ast_expiring/w_640,f_webp"] },
      { id: "col_press", name: "Press", count: 0, covers: [] },
    ],
    brands: [],
    site: {},
    // With no brand, the portal's accent over the app's own look, as lib/core/page-view.ts viewLook makes it.
    look: { brand: null, theme: { ...deriveTheme([{ key: "color.accent", type: "color", value: "#2f62ff", context: null, assets: [], spec: null }]), settings: {} }, signed: {} },
    madeWith: true,
    ...over,
  },
  data,
  total,
});

let asked: string[] = [];

/**
 * A portal's Assets view (PortalAssets): its collections' files, searchable, wearing the brand's site when it has one.
 * Search waits for typing to pause; a collection picked goes at once; the address says what is shown.
 */
const meta = preview.meta({
  title: "App/Features/Library/Portal assets",
  component: PortalAssets,
  parameters: { layout: "fullscreen" },
  args: { slug: "press", base: "/p/press", initial: view(), headers: () => ({}), onLost: fn() },
  beforeEach: ({ msw }) => {
    asked = [];
    msw.use(
      ...renditions,
      http.get("/api/v1/portal/:slug", async ({ request }) => {
        const u = new URL(request.url);
        asked.push(u.search);
        await delay(150);
        const q = u.searchParams.get("q");
        return HttpResponse.json(view({}, q ? items.filter((i) => (i.title ?? i.filename).toLowerCase().includes(q.toLowerCase())) : items.slice(0, 2)));
      }),
    );
  },
});

/** The front: search, the collections as tabs and cards, then every file. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("navigation", { name: "Collections" })).toBeInTheDocument();
    await expect(canvas.getByText("7 files")).toBeInTheDocument();
  },
});

/** Search: the list answers once typing pauses, and says what it found. */
export const Search = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search" }), "logo");
    await expect(await canvas.findByText("1 match for “logo”")).toBeInTheDocument();
    await waitFor(() => expect(asked).toEqual(["?limit=60&offset=0&q=logo"]));
  },
});

/** A collection picked from its tab. */
export const Collection = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: /Logos/ })[0]);
    await expect(await canvas.findByText("2 files in Logos")).toBeInTheDocument();
  },
});

/** Nothing matches: say so, and Clear search. */
export const NoMatches = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search" }), "zebra");
    await expect(await canvas.findByText("No files match “zebra”")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Clear search" }));
    await expect(canvas.getByRole("searchbox", { name: "Search" })).toHaveValue("");
    await expect(await canvas.findByText("2 files")).toBeInTheDocument();
  },
});

/** An empty portal. */
export const Empty = meta.story({ args: { initial: view({ collections: [] }, [], 0) } });

/** More than a page: Show more. */
export const Many = meta.story({ args: { initial: view({ expiresAt: "2026-12-31T23:59:59Z" }, items, 140) } });

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
