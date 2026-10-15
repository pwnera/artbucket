import preview from "#.storybook/preview";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { asset, assets, byId, inApp, library, listing, many, renditions } from "#.storybook/fixtures/library";
import { AssetCard, Gallery, WELLS, type Asset } from "@/components/gallery";
import { GRID_COLS } from "@/components/skeletons";
import { cn } from "@/lib/utils";

/** Tiles as the grid lays them out: one tab stop, the well behind the art, any well picked. */
function Tiles({ items, well = "auto", selected = [], selecting = false, large = false }: { items: Asset[]; well?: string; selected?: string[]; selecting?: boolean; large?: boolean }) {
  return (
    <ul aria-label="Assets" data-well={well} className={cn("group/well grid", GRID_COLS)} style={{ "--tile": large ? "260px" : "180px" } as React.CSSProperties}>
      {items.map((a, i) => (
        <li key={a.id} className="group/tile -m-1 p-1">
          <AssetCard asset={a} selected={selected.includes(a.id)} selecting={selecting} onOpen={fn()} onPick={fn()} tabbable={i === 0} large={large} />
        </li>
      ))}
    </ul>
  );
}

/**
 * A tile of the library's grid (AssetCard): its art contained on a well, a type badge with its version, what waits on
 * it, its state, its size, three tags. A click opens it; Cmd, Ctrl or Shift selects; once anything is selected, a
 * click selects.
 */
const meta = preview.meta({
  title: "App/Features/Library/Gallery",
  component: AssetCard,
  args: { asset: byId("ast_hero"), selected: false, selecting: false, large: false, fresh: false, onOpen: fn(), onPick: fn() },
  beforeEach: ({ msw }) => void msw.use(...renditions),
});

/** One tile at a tile's width. */
const tile = [(Story: React.ComponentType) => <div className="w-56"><Story /></div>];
const wide = [(Story: React.ComponentType) => <div className="w-[min(100vw,1100px)]"><Story /></div>];

export const Playground = meta.story({
  decorators: tile,
  play: async ({ args, canvas, userEvent }) => {
    const tile = canvas.getByRole("button", { name: "Autumn campaign hero" });
    await userEvent.click(tile);
    await expect(args.onOpen).toHaveBeenCalledWith(args.asset);
    await userEvent.keyboard("{Shift>}");
    await userEvent.click(tile);
    await userEvent.keyboard("{/Shift}");
    await expect(args.onPick).toHaveBeenCalledWith(args.asset, true);
  },
});

/** Selected, with the selection on: the checkbox shows, and the tile is pressed. */
export const Selected = meta.story({
  decorators: tile,
  args: { selected: true, selecting: true },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole("button", { name: "Autumn campaign hero" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Autumn campaign hero" }));
    await expect(args.onPick).toHaveBeenCalledWith(args.asset, false);
    await expect(args.onOpen).not.toHaveBeenCalled();
  },
});

/** Just uploaded: ringed for a moment, so it is found in a full grid. */
export const Fresh = meta.story({ decorators: tile, args: { fresh: true } });

/** A name too long for a tile: cut, whole on hover and for a screen reader. */
export const LongName = meta.story({
  decorators: tile,
  args: { asset: byId("ast_long") },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /co-branded retail window display/ })).toBeInTheDocument();
  },
});

/** Every kind the grid draws differently: a photo, an SVG logo with transparency, a one-ink icon, a clip with its length, a Lottie, a font, a PDF's page, a zip, a Figma link; and the states it badges (suggested by an agent, replaced, expiring, archived). */
export const Formats = meta.story({
  decorators: wide,
  render: () => <Tiles items={assets} />,
  play: async ({ canvas }) => {
    const grid = canvas.getByRole("list", { name: "Assets" });
    await expect(within(grid).getByRole("button", { name: "brand-reel-2026.mp4" })).toHaveAccessibleDescription(/MP4/);
    await expect(within(grid).getByText("1:34")).toBeInTheDocument();
    await expect(within(grid).getByText("Replaced")).toBeInTheDocument();
    await expect(within(grid).getByText("FIGMA")).toBeInTheDocument();
    await expect(within(grid).getByRole("button", { name: "generated-moodboard.png" })).toHaveAccessibleDescription(/Suggested, AI-made/);
  },
});

/** What sits behind the art, as View options picks it: auto, light, dark or a checkerboard. */
export const Wells = meta.story({
  decorators: wide,
  render: () => (
    <div className="grid gap-6">
      {WELLS.map((w) => (
        <section key={w} className="grid gap-2">
          <h3 className="text-sm font-medium capitalize">{w}</h3>
          <Tiles items={[byId("ast_logo"), byId("ast_icon_star"), byId("ast_mark"), byId("ast_hero")]} well={w} />
        </section>
      ))}
    </div>
  ),
});

/** Large tiles (=): a bigger rendition, a bigger glyph. */
export const Large = meta.story({
  decorators: wide,
  render: () => <Tiles items={assets.slice(0, 4)} large />,
});

/** Mid-selection: every checkbox shows, two are ticked. */
export const Selecting = meta.story({
  decorators: wide,
  render: () => <Tiles items={assets.slice(0, 6)} selecting selected={["ast_hero", "ast_mark"]} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("checkbox", { name: "Select autumn-campaign-hero.jpg" })).toBeChecked();
    await expect(canvas.getByRole("checkbox", { name: "Select acme-logo.svg" })).not.toBeChecked();
  },
});

export const Phone = meta.story({
  globals: { viewport: { value: "phone" } },
    render: () => <Tiles items={assets.slice(0, 6)} />,
});

// ---- the whole library -----------------------------------------------------------------------------

const page = { layout: "fullscreen", nextjs: { navigation: { pathname: "/", query: { browse: "" } } } } as const;
const at = (status = 200) => ({ status });

/**
 * The library page (Gallery) inside the app: Assets' grid with its filters, the selection bar, the upload tray and the
 * asset viewer. What it shows is the URL; these open on ?browse, the plain grid.
 */
export const Library = meta.story({
  decorators: [inApp],
  parameters: page,
  beforeEach: ({ msw }) => void msw.use(...library()),
  render: () => <Gallery initial={listing(assets)} fields={[]} initialLayout="grid" />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "All assets" }, { timeout: 5000 })).toBeInTheDocument();
    await expect(canvas.getByRole("list", { name: "Assets" })).toBeInTheDocument();
    await expect(canvas.getByText(`Showing all ${assets.length} assets`)).toBeInTheDocument();
  },
});

/** As rows: denser, the right shape for deciding. */
export const LibraryList = meta.story({
  decorators: [inApp],
  parameters: page,
  beforeEach: ({ msw }) => void msw.use(...library()),
  render: () => <Gallery initial={listing(assets)} fields={[]} initialLayout="list" />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("table")).toBeInTheDocument();
  },
});

/** A first visit: the whole page is the upload target. */
export const EmptyLibrary = meta.story({
  decorators: [inApp],
  parameters: page,
  beforeEach: ({ msw }) => void msw.use(...library([])),
  render: () => <Gallery initial={listing([])} fields={[]} />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Your brand, as data")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Upload files" })).toBeInTheDocument();
  },
});

/** A viewer's empty library: nothing to upload with, the guidelines to read. */
export const EmptyForViewer = meta.story({
  decorators: [inApp],
  parameters: { ...page, app: { scope: "read" } },
  beforeEach: ({ msw }) => void msw.use(...library([])),
  render: () => <Gallery initial={listing([])} fields={[]} />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Nothing here yet")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
  },
});

/** A search that finds nothing: what to try, and that the gap is logged. */
export const NoResults = meta.story({
  decorators: [inApp],
  parameters: { ...page, nextjs: { navigation: { pathname: "/", query: { browse: "", q: "holiday banner" } } } },
  beforeEach: ({ msw }) => void msw.use(...library([])),
  render: () => <Gallery initial={listing([], 0)} fields={[]} />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/No results for/)).toBeInTheDocument();
  },
});

/** Review (/review): what agents and contributors sent, as rows to decide. */
export const Review = meta.story({
  decorators: [inApp],
  parameters: { ...page, nextjs: { navigation: { pathname: "/review" } } },
  beforeEach: ({ msw }) => void msw.use(...library()),
  render: () => <Gallery initial={listing([byId("ast_ai"), { ...byId("ast_hero"), proposedTags: ["outdoor", "city"] }])} fields={[]} />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "Waiting for review" })).toBeInTheDocument();
    await expect(canvas.getByText("Campaign agent")).toBeInTheDocument();
  },
});

/** A long library: the first page, and Load more for the rest. */
export const Many = meta.story({
  decorators: [inApp],
  parameters: page,
  beforeEach: ({ msw }) =>
    void msw.use(
      ...library(),
      http.get("/api/v1/assets", ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
        return HttpResponse.json(listing(many(260).slice(offset, offset + 100), 260));
      }),
    ),
  render: () => <Gallery initial={listing(many(100), 260)} fields={[]} />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: /Load more/ })).toHaveTextContent("100 of 260");
  },
});

/** Pick two tiles, then tag them from the selection bar: one PATCH each, with the tag added to what they had. */
export const SelectAndTag = meta.story({
  decorators: [inApp],
  parameters: page,
  beforeEach: ({ msw }) => {
    patched.length = 0;
    msw.use(
      ...library(),
      http.patch("/api/v1/assets/:id", async ({ params, request }) => {
        const body = (await request.json()) as { tags: string[] };
        patched.push({ id: String(params.id), tags: body.tags });
        return HttpResponse.json({ data: { ...byId(String(params.id)), ...body } });
      }),
    );
  },
  render: () => <Gallery initial={listing(assets)} fields={[]} initialLayout="grid" />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("checkbox", { name: "Select autumn-campaign-hero.jpg" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select acme-mark.png" }));
    const bar = await canvas.findByRole("toolbar", { name: "Selection" });
    await expect(bar).toHaveTextContent(/2 of 15/);
    await userEvent.click(within(bar).getByRole("button", { name: "Tag" }));
    await userEvent.type(await screen.findByPlaceholderText("Tags to add"), "featured{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Tag selection" }));
    await waitFor(() => expect(patched).toHaveLength(2));
    await expect(patched.find((p) => p.id === "ast_hero")?.tags).toEqual(["campaign", "autumn", "hero", "outdoor", "featured"]);
    await expect(patched.find((p) => p.id === "ast_mark")?.tags).toEqual(["logo", "mark", "featured"]);
  },
});
const patched: { id: string; tags: string[] }[] = [];

/** Select all, then Delete: one DELETE each, at once, with Undo. */
export const SelectAllAndDelete = meta.story({
  decorators: [inApp],
  parameters: page,
  beforeEach: ({ msw }) => {
    deleted.length = 0;
    msw.use(
      ...library(assets.slice(0, 3)),
      http.delete("/api/v1/assets/:id", ({ params }) => {
        deleted.push(String(params.id));
        return HttpResponse.json({ data: {} });
      }),
    );
  },
  render: () => <Gallery initial={listing(assets.slice(0, 3))} fields={[]} initialLayout="grid" />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("checkbox", { name: "Select all 3 loaded" }));
    const bar = await canvas.findByRole("toolbar", { name: "Selection" });
    await userEvent.click(within(bar).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleted.sort()).toEqual(["ast_hero", "ast_icon_star", "ast_logo"]));
  },
});
const deleted: string[] = [];

/** Upload: a ticket, the bytes to storage with progress, then the asset; the tray counts them in. */
export const Upload = meta.story({
  decorators: [inApp],
  parameters: page,
  beforeEach: ({ msw }) => void msw.use(...library(), ...uploadFlow()),
  render: () => <Gallery initial={listing(assets.slice(0, 4))} fields={[]} initialLayout="grid" />,
  play: async ({ canvasElement, userEvent }) => {
    const input = canvasElement.ownerDocument.querySelector<HTMLInputElement>("input[type=file][multiple]")!;
    await userEvent.upload(input, [new File(["a"], "lookbook-01.jpg", { type: "image/jpeg" }), new File(["b"], "lookbook-02.jpg", { type: "image/jpeg" })]);
    const tray = await screen.findByRole("region", { name: "Uploads" });
    await expect(tray).toHaveTextContent(/Uploading 2 files/);
    await waitFor(() => expect(within(tray).getByRole("status")).toHaveTextContent(/2 (files uploaded|added)/), { timeout: 5000 });
  },
});

/** One file of a batch refused by the API: the rest land, it says why, and Retry sends it again. */
export const UploadFailsThenRetry = meta.story({
  decorators: [inApp],
  parameters: page,
  beforeEach: ({ msw }) => void msw.use(...library(), ...uploadFlow({ failFirst: "broken.psd" })),
  render: () => <Gallery initial={listing(assets.slice(0, 4))} fields={[]} initialLayout="grid" />,
  play: async ({ canvasElement, userEvent }) => {
    const input = canvasElement.ownerDocument.querySelector<HTMLInputElement>("input[type=file][multiple]")!;
    await userEvent.upload(input, [new File(["a"], "fine.jpg", { type: "image/jpeg" }), new File(["b"], "broken.psd", { type: "image/vnd.adobe.photoshop" })]);
    const tray = await screen.findByRole("region", { name: "Uploads" });
    await waitFor(() => expect(within(tray).getByRole("status")).toHaveTextContent("1 uploaded, 1 failed"), { timeout: 5000 });
    await expect(within(tray).getByText("That file type isn't allowed in this project")).toBeInTheDocument();
    await userEvent.click(within(tray).getByRole("button", { name: "Retry broken.psd" }));
    await waitFor(() => expect(within(tray).queryByRole("button", { name: "Retry broken.psd" })).not.toBeInTheDocument(), { timeout: 5000 });
  },
});

/**
 * The upload API: a ticket, a PUT to storage that takes a moment, then the asset. `failFirst` names a file the API
 * refuses the first time it is finished.
 */
function uploadFlow({ failFirst }: { failFirst?: string } = {}) {
  let refused = false;
  let n = 0;
  return [
    http.post("/api/v1/uploads", async ({ request }) => {
      const { filename } = (await request.json()) as { filename: string };
      return HttpResponse.json({ token: `tok_${filename}`, uploadUrl: `/storage/put/${encodeURIComponent(filename)}` });
    }),
    http.put("/storage/put/:name", async () => {
      await delay(400);
      return new HttpResponse(null, at());
    }),
    http.post("/api/v1/assets", async ({ request }) => {
      const { filename, mime } = (await request.json()) as { filename: string; mime: string };
      await delay(150);
      if (filename === failFirst && !refused) {
        refused = true;
        return HttpResponse.json({ error: { code: "invalid", message: "That file type isn't allowed in this project" } }, { status: 422 });
      }
      return HttpResponse.json({ data: asset({ id: `ast_up_${++n}`, filename, mime }) });
    }),
  ];
}

export const LibraryPhone = meta.story({
  decorators: [inApp],
  parameters: page,
  globals: { viewport: { value: "phone" } },
  beforeEach: ({ msw }) => void msw.use(...library()),
  render: () => <Gallery initial={listing(assets)} fields={[]} initialLayout="grid" />,
});

/** The grid's keys, as Finder's: arrows move (Shift extends), X selects, Esc clears. */
export const GridKeyboard = meta.story({
  decorators: [inApp],
  parameters: page,
  beforeEach: ({ msw }) => void msw.use(...library()),
  render: () => <Gallery initial={listing(assets.slice(0, 6))} fields={[]} initialLayout="grid" />,
  play: async ({ canvas, userEvent }) => {
    const first = await canvas.findByRole("button", { name: "Autumn campaign hero" });
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("button", { name: "Acme logo, full color" })).toHaveFocus();
    await userEvent.keyboard("x{Shift>}{ArrowRight}{/Shift}");
    const bar = await canvas.findByRole("toolbar", { name: "Selection" });
    await expect(bar).toHaveTextContent(/2 of 6/);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvas.queryByRole("toolbar", { name: "Selection" })).not.toBeInTheDocument());
  },
});
