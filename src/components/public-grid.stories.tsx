import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { publicItems, renditions } from "#.storybook/fixtures/library";
import { Downloads, KindIcon, Lightbox, PublicGrid, Stage } from "@/components/public-grid";

/**
 * The public grid (PublicGrid), the same for a portal, a share link and a page's collection: tiles that open the
 * lightbox, each tile's downloads, and "Can I use this?" where the surface may ask.
 */
const meta = preview.meta({
  title: "App/Features/Library/Public grid",
  component: PublicGrid,
  args: { items: publicItems, busy: false },
  beforeEach: ({ msw }) => void msw.use(...renditions),
});

/** A tile opens the lightbox; arrows step, Esc closes and gives focus back to the tile. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    const tile = canvas.getByRole("button", { name: "Look at Autumn campaign hero" });
    await userEvent.click(tile);
    const dialog = await screen.findByRole("dialog", { name: "Autumn campaign hero" });
    await expect(within(dialog).getByText("1 of 7")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    await expect(await screen.findByRole("dialog", { name: "Acme logo, full color" })).toBeInTheDocument();
    // Esc closes a tooltip first, when one is up, then the lightbox.
    await waitFor(async () => {
      await userEvent.keyboard("{Escape}");
      await expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await expect(canvas.getByRole("button", { name: "Look at Autumn campaign hero" })).toHaveFocus();
  },
});

/** A tile's presets, a download each, heard with a toast. */
export const Download = meta.story({
  play: async ({ canvas, userEvent }) => {
    const list = canvas.getByRole("list", { name: "Download Autumn campaign hero" });
    const web = within(list).getByRole("link", { name: "Web" });
    web.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(web);
    await expect(await screen.findByText("Downloading autumn-campaign-hero.webp")).toBeInTheDocument();
  },
});

/** On a portal: "Can I use this?" under each tile, asking the portal's check. */
export const CanIUse = meta.story({
  args: { ask: fn(() => Promise.resolve(new Response(JSON.stringify({ allowed: true, reasons: [], suggest: [] }), { status: 200 }))) },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: "Can I use this?" })[0]);
    const pop = await screen.findByRole("dialog", { name: "Can I use this?" });
    await userEvent.click(within(pop).getByRole("button", { name: "Check" }));
    await expect(await within(pop).findByText("Yes, you can use it")).toBeInTheDocument();
    await expect(args.ask).toHaveBeenCalledWith("ast_hero", expect.any(Object));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** Opened from a link (?asset=): the lightbox at once. */
export const Linked = meta.story({
  args: { asset: "ast_reel" },
  play: async () => {
    await expect(await screen.findByRole("dialog", { name: "brand-reel-2026.mp4" })).toBeInTheDocument();
  },
});

/** While a search runs: dimmed, busy. */
export const Busy = meta.story({ args: { busy: true } });

/** Files without a still: their kind and type, set large. */
export const NoStills = meta.story({
  args: { items: publicItems.map((i) => ({ ...i, thumbnail: null, preview: null })) },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

/** The lightbox alone, on a file with several downloads: a menu. */
export const LightboxDownloads = meta.story({
  render: () => <Lightbox items={publicItems} openId="ast_hero" onOpen={fn()} />,
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Download" }));
    await expect(await screen.findByRole("menuitem", { name: /Print/ })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  },
});

/** The parts: Downloads (one, several, none), the stage, each kind's icon. */
export const Parts = meta.story({
  render: () => (
    <div className="grid gap-6">
      <div className="flex items-center gap-2">
        <Downloads item={publicItems[0]} />
        <Downloads item={publicItems[2]} />
        <Downloads item={publicItems[2]} variant="default" />
        <Downloads item={publicItems[0]} variant="default" size="lg" />
        <Downloads item={publicItems[5]} />
      </div>
      <Stage item={publicItems[4]} className="h-48 w-72" />
      <div className="text-muted-foreground flex gap-3">
        {publicItems.map((i) => (
          <KindIcon key={i.id} item={i} />
        ))}
      </div>
    </div>
  ),
});

/** Stills that fail to load: the no-preview well, not a broken image. */
export const BrokenStills = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/a/:id/:spec", () => new HttpResponse(null, { status: 500 }))),
});
