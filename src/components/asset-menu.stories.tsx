import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { as, byId, collections, renditions } from "#.storybook/fixtures/library";
import { AssetMenu, AssetMenuButton } from "@/components/asset-menu";
import { AssetCard } from "@/components/gallery";

const sent: { method: string; url: string; body: unknown }[] = [];

/**
 * Right click on an asset (AssetMenu): what its tile, its row and its editor offer, in one place, each only when
 * allowed. On an asset that is part of a bigger selection it acts on all of it, as Finder's does.
 */
const meta = preview.meta({
  title: "App/Features/Library/Asset menu",
  component: AssetMenu,
  decorators: [as],
  args: { asset: byId("ast_hero"), onOpen: fn(), onShare: fn(), onPick: fn(), onChanged: fn(), selected: false, children: null },
  beforeEach: ({ msw }) => {
    sent.length = 0;
    msw.use(
      ...renditions,
      http.all("/api/v1/assets/:id*", async ({ request }) => {
        if (request.method === "GET") return;
        sent.push({ method: request.method, url: new URL(request.url).pathname, body: await request.json().catch(() => null) });
        return HttpResponse.json({ data: { ...byId("ast_hero"), public: true } });
      }),
    );
  },
  render: (args) => (
    <div className="w-56">
      <AssetMenu {...args}>
        <div>
          <AssetCard asset={args.asset} onOpen={fn()} />
        </div>
      </AssetMenu>
    </div>
  ),
});

const open = async (canvas: { getByRole: (r: string, o: object) => HTMLElement }, userEvent: { pointer: (a: object) => Promise<void> }, name: string) => {
  await userEvent.pointer({ keys: "[MouseRight]", target: canvas.getByRole("button", { name }) });
  return screen.findByRole("menu");
};

/** Esc, and the menu gone: what was hidden behind it is back for the a11y check. */
const close = async (userEvent: { keyboard: (k: string) => Promise<void> }) => {
  while (screen.queryAllByRole("menu").length) await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryAllByRole("menu")).toHaveLength(0));
};

/** An editor's menu: open, select, copy and share, download sizes, archive, an embed URL, delete. */
export const Editor = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await open(canvas, userEvent, "Autumn campaign hero");
    await expect(screen.getByRole("menuitem", { name: /Archive/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: /Open/ }));
    await expect(args.onOpen).toHaveBeenCalled();
    await close(userEvent);
  },
});

/** Get an embed URL: PATCH public, and Undo in the toast. */
export const EmbedUrl = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await open(canvas, userEvent, "Autumn campaign hero");
    await userEvent.click(screen.getByRole("menuitem", { name: /Get an embed URL/ }));
    await waitFor(() => expect(sent).toEqual([{ method: "PATCH", url: "/api/v1/assets/ast_hero", body: { public: true } }]));
    await expect(args.onChanged).toHaveBeenCalled();
    await expect(await screen.findByText("Embed URL on: anyone with it gets the file")).toBeInTheDocument();
    await close(userEvent);
  },
});

/** Download, by size: a submenu of the presets for an image. */
export const Download = meta.story({
  play: async ({ canvas, userEvent }) => {
    await open(canvas, userEvent, "Autumn campaign hero");
    await userEvent.click(screen.getByRole("menuitem", { name: /Download/ }));
    await expect(await screen.findByRole("menuitem", { name: /Social square/ })).toBeInTheDocument();
    await close(userEvent);
  },
});

/** A suggestion waiting: Approve and Reject come first; Reject opens the asset to say why. */
export const Proposed = meta.story({
  args: { asset: byId("ast_ai") },
  play: async ({ canvas, userEvent }) => {
    await open(canvas, userEvent, "generated-moodboard.png");
    await expect(screen.getByRole("menuitem", { name: /Approve/ })).toBeInTheDocument();
    await expect(screen.getByRole("menuitem", { name: /Reject/ })).toBeInTheDocument();
    await close(userEvent);
  },
});

/** A deleted asset: Restore, and nothing that would share it. */
export const Deleted = meta.story({
  args: { asset: { ...byId("ast_hero"), state: "deleted", deletedAt: "2026-10-14T09:00:00Z" } },
  play: async ({ canvas, userEvent }) => {
    await open(canvas, userEvent, "Autumn campaign hero");
    await userEvent.click(screen.getByRole("menuitem", { name: /Restore/ }));
    await waitFor(() => expect(sent).toEqual([{ method: "POST", url: "/api/v1/assets/ast_hero/restore", body: null }]));
    await close(userEvent);
  },
});

/** A viewer: open, copy, share and download only. */
export const Viewer = meta.story({
  parameters: { app: { scope: "read" } },
  play: async ({ canvas, userEvent }) => {
    await open(canvas, userEvent, "Autumn campaign hero");
    await expect(screen.queryByRole("menuitem", { name: /Delete/ })).not.toBeInTheDocument();
    await expect(screen.queryByRole("menuitem", { name: /Archive/ })).not.toBeInTheDocument();
    await close(userEvent);
  },
});

/** Part of a selection of 12: the menu acts on all of them. */
export const Selection = meta.story({
  args: { selected: true, bulk: { count: 12, into: collections, add: fn(), download: fn(), remove: fn() } },
  play: async ({ args, canvas, userEvent }) => {
    await open(canvas, userEvent, "Autumn campaign hero");
    await expect(screen.getByText("12 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: /Add 12 to/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Logos" }));
    await expect(args.bulk?.add).toHaveBeenCalledWith(collections[1]);
    await close(userEvent);
  },
});

/** One asset's menu adds it to a collection, as a selection's does: the collections it isn't in yet. */
export const AddToCollection = meta.story({
  args: { addTo: { into: collections, add: fn() } },
  play: async ({ args, canvas, userEvent }) => {
    const menu = await open(canvas, userEvent, "Autumn campaign hero");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Add to collection" }));
    const target = collections.find((c) => !args.asset.collections.includes(c.id))!;
    await userEvent.click(await screen.findByRole("menuitem", { name: target.name }));
    await expect(args.addTo!.add).toHaveBeenCalledWith(target);
    await close(userEvent);
  },
});

/** The card's ⋯: the same menu, for touch and keyboards. */
export const MenuButton = meta.story({
  render: (args) => (
    <div className="group relative w-56">
      <AssetCard asset={args.asset} onOpen={fn()} menu={<AssetMenuButton {...args} />} />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Autumn campaign hero" }));
    await expect(await screen.findByRole("menuitem", { name: /Open/ })).toBeInTheDocument();
    await expect(screen.getByRole("menuitem", { name: "Download" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  },
});
