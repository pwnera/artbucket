import preview from "#.storybook/preview";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { as, byId, renditions, versions } from "#.storybook/fixtures/library";
import { Lifecycle, StatusBadges, Versions } from "@/components/versions";

const sent: string[] = [];

/**
 * An asset's stack of versions (Versions), folded to "3 versions · v3 current": which one is current, making an
 * earlier one current again (with Undo), comparing two side by side, and adding the next.
 */
const meta = preview.meta({
  title: "App/Features/Library/Versions",
  component: Versions,
  decorators: [as, (Story) => <div className="w-96">{Story()}</div>],
  args: { asset: byId("ast_hero"), onChanged: fn(), onOpen: fn() },
  beforeEach: ({ msw }) => {
    sent.length = 0;
    msw.use(
      ...renditions,
      http.get("/api/v1/assets/:id/versions", () => HttpResponse.json({ data: versions })),
      http.post("/api/v1/assets/:id/versions/:n/current", async ({ params }) => {
        sent.push(`current v${params.n}`);
        await delay(200);
        return HttpResponse.json({ data: versions.map((v) => ({ ...v, current: v.version === Number(params.n) })) });
      }),
    );
  },
});

/** Open the fold, unless it remembers being open. */
const unfold = async (canvas: { getByText: (t: string) => HTMLElement }, userEvent: { click: (e: Element) => Promise<void> }) => {
  const summary = canvas.getByText("Versions");
  if (!summary.closest("details")?.open) await userEvent.click(summary);
};

/** Three versions, v3 current: the stack, Compare and Make current. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("3 versions · v3 current")).toBeInTheDocument();
    await unfold(canvas, userEvent);
    await expect(canvas.getByText("Current")).toBeInTheDocument();
    await expect(canvas.getByRole("listitem", { current: true })).toHaveTextContent("v3");
  },
});

/** Make v1 current again: the button spins, the stack moves, and Undo puts v3 back. */
export const RestoreAnEarlierVersion = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await canvas.findByText("3 versions · v3 current");
    await unfold(canvas, userEvent);
    await userEvent.click(canvas.getByRole("button", { name: "Make current" }));
    await waitFor(() => expect(args.onChanged).toHaveBeenCalledWith(expect.objectContaining({ id: "ast_hero", current: false })));
    await expect(await canvas.findByText("3 versions · v1 current")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(sent).toEqual(["current v1", "current v3"]));
  },
});

/** Two versions side by side, older on the left, what differs in bold, under the list rather than over the viewer. */
export const Compare = meta.story({
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText("3 versions · v3 current");
    await unfold(canvas, userEvent);
    await userEvent.click(canvas.getByRole("button", { name: "Compare with version 1" }));
    // In the viewer, under the versions: no dialog over it.
    const it = await canvas.findByRole("region", { name: "Version 1 and version 3" });
    await expect(within(it).getByRole("rowheader", { name: "Title" })).toBeInTheDocument();
    await expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(within(it).getByRole("button", { name: "Close the comparison" }));
    await waitFor(() => expect(canvas.queryByRole("region", { name: "Version 1 and version 3" })).not.toBeInTheDocument());
  },
});

/** While the stack loads: skeleton rows, not the explanation. */
export const Loading = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/assets/:id/versions", async () => {
        await delay("infinite");
        return HttpResponse.json({ data: [] });
      }),
    ),
});

/** One version: how the next one is added. */
export const Single = meta.story({
  args: { asset: { ...byId("ast_mark"), stackId: null, version: null } },
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/assets/:id/versions", () => HttpResponse.json({ data: [] }))),
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("1 version")).toBeInTheDocument();
    await unfold(canvas, userEvent);
    await expect(canvas.getByText("Drop a new version on the preview.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "New version" }));
    await expect(await screen.findByRole("menuitem", { name: "Upload as a draft" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  },
});

/** A contributor: Suggest a new version, no Make current. */
export const Contributor = meta.story({
  parameters: { app: { scope: "propose" } },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText("3 versions · v3 current");
    await unfold(canvas, userEvent);
    await expect(canvas.getByRole("button", { name: "Suggest a new version" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Make current" })).not.toBeInTheDocument();
  },
});

/** A viewer of a single version: nothing to show. */
export const Viewer = meta.story({
  parameters: { app: { scope: "read" } },
  args: { asset: { ...byId("ast_mark"), stackId: null, version: null } },
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/assets/:id/versions", () => HttpResponse.json({ data: [] }))),
});

/** The status line under an asset's title: approved and current, its last day, an embargo. */
export const Badges = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadges asset={byId("ast_hero")} />
      <StatusBadges asset={{ ...byId("ast_expiring"), rights: { ...byId("ast_expiring").rights!, embargo: "2099-01-01" } }} />
      <StatusBadges asset={byId("ast_archived")} />
    </div>
  ),
});

/** Out of the library (Lifecycle): what that means, and the move that comes next. Restore a deleted asset. */
export const Deleted = meta.story({
  render: (args) => <Lifecycle asset={{ ...byId("ast_hero"), state: "deleted", deletedAt: "2026-10-14T09:00:00Z" }} onChanged={args.onChanged} />,
  beforeEach: ({ msw }) =>
    void msw.use(
      http.post("/api/v1/assets/:id/restore", async () => {
        await delay(200);
        return HttpResponse.json({ data: byId("ast_hero") });
      }),
    ),
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText(/Deleted, links off/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(args.onChanged).toHaveBeenCalledWith(byId("ast_hero")));
  },
});

/** A draft: submit it for review, or approve it. */
export const Draft = meta.story({
  render: (args) => <Lifecycle asset={{ ...byId("ast_hero"), status: "draft", state: "draft" }} onChanged={args.onChanged} />,
});

/** Expired and archived. */
export const Retired = meta.story({
  render: (args) => (
    <div className="grid gap-3">
      <Lifecycle asset={{ ...byId("ast_expiring"), state: "expired" }} onChanged={args.onChanged} />
      <Lifecycle asset={byId("ast_archived")} onChanged={args.onChanged} />
    </div>
  ),
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
