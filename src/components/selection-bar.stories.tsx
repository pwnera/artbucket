import preview from "#.storybook/preview";
import { useState } from "react";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { assets, byId, collections, fields, inApp, library } from "#.storybook/fixtures/library";
import type { Asset } from "@/components/gallery";
import { SelectionBar, useBulk } from "@/components/selection-bar";

/** The bar as the library drives it: its selection and the bulk work over it. */
function Bar({ picked: first, review = false, current }: { picked: Asset[]; review?: boolean; current?: string }) {
  const [picked, setPicked] = useState(first);
  const bulk = useBulk({ picked, current, onDone: fn(), onClear: () => setPicked([]) });
  return (
    <SelectionBar
      picked={picked}
      loaded={assets.length}
      total={240}
      collections={collections}
      fields={fields}
      current={collections.find((c) => c.id === current)}
      review={review}
      bulk={bulk}
      onSelectAll={() => setPicked(assets)}
      onClear={() => setPicked([])}
      onOpenCollection={fn()}
    />
  );
}

const sent: { method: string; url: string; body: unknown }[] = [];
const record = (slow = 0) =>
  http.all("/api/v1/*", async ({ request }) => {
    if (request.method === "GET") return;
    await delay(slow);
    sent.push({ method: request.method, url: new URL(request.url).pathname, body: await request.json().catch(() => null) });
    return HttpResponse.json({ data: {} });
  });

/**
 * Bulk actions over the selected assets (SelectionBar), floating over the grid: tag and untag, status, expiry, add to
 * a collection, download as a zip, delete. Each shows when it is allowed on every asset picked; T tags.
 */
const meta = preview.meta({
  title: "App/Features/Library/Selection bar",
  decorators: [inApp],
  parameters: { layout: "fullscreen" },
  beforeEach: ({ msw }) => {
    sent.length = 0;
    msw.use(...library(), record());
  },
  render: () => <Bar picked={assets.slice(0, 3)} />,
});

/** Three of 240 selected, by an editor. */
export const Default = meta.story({
  play: async ({ canvas }) => {
    const bar = canvas.getByRole("toolbar", { name: "Selection" });
    await expect(bar).toHaveTextContent("3 of 240");
    await expect(within(bar).getByRole("button", { name: "Select all 15" })).toBeInTheDocument();
  },
});

/** T opens Tag; Add makes a new tag; Tag selection sends one PATCH per asset. */
export const TagWithKeyboard = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.keyboard("t");
    await userEvent.type(await screen.findByPlaceholderText("Tags to add"), "launch{Enter}");
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => expect(sent.filter((s) => s.method === "PATCH")).toHaveLength(3));
    await expect(sent[0].body).toEqual({ tags: expect.arrayContaining(["launch"]) });
  },
});

/** Add to: a check for collections all of it is in, a dash for some; a pick posts the ids once. */
export const AddToCollection = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add to collection" }));
    await userEvent.click(await screen.findByRole("option", { name: /Press/ }));
    await waitFor(() => expect(sent).toEqual([{ method: "POST", url: "/api/v1/collections/col_press/assets", body: { add: ["ast_hero", "ast_logo", "ast_icon_star"] } }]));
  },
});

/** The last day of use, set across the selection. */
export const Expiry = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Expiry" }));
    await userEvent.type(await screen.findByLabelText(/Last day of use/, { selector: "input" }), "2026-12-31");
    await userEvent.click(screen.getByRole("button", { name: "Set" }));
    await waitFor(() => expect(sent).toHaveLength(3));
  },
});

/** Delete goes at once, counting up in the bar while it works; the toast offers Undo (the trash keeps them 30 days). */
export const Delete = meta.story({
  beforeEach: ({ msw }) => void msw.use(record(300)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
    await expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await expect(await canvas.findByText(/Deleted \d of 3/)).toBeInTheDocument();
    await waitFor(() => expect(sent.filter((s) => s.method === "DELETE")).toHaveLength(3));
  },
});

/** In Review: Approve and Reject first. A decision waits out its Undo before it is sent. */
export const Review = meta.story({
  render: () => <Bar picked={[byId("ast_ai")]} review />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Reject…" }));
    await userEvent.type(await screen.findByRole("textbox", { name: "Reason for rejecting" }), "Not on brand");
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await expect(await screen.findByText("Rejected 1 asset")).toBeInTheDocument();
    await expect(sent).toHaveLength(0);
  },
});

/** Inside a collection: Remove from it. */
export const InCollection = meta.story({
  render: () => <Bar picked={[byId("ast_hero")]} current="col_campaign" />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Remove from Autumn campaign/ }));
    await waitFor(() => expect(sent).toEqual([{ method: "POST", url: "/api/v1/collections/col_campaign/assets", body: { remove: ["ast_hero"] } }]));
  },
});

/** A viewer: download, and nothing that changes the assets. */
export const Viewer = meta.story({
  parameters: { app: { scope: "read" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Download" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Tag" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  },
});

/** Mixed states: Status offers each move only for the part it applies to. */
export const Status = meta.story({
  render: () => <Bar picked={[byId("ast_archived"), byId("ast_hero"), byId("ast_expiring")]} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Status" }));
    await expect(await screen.findByRole("menuitem", { name: "Archive" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Unarchive" }));
    await waitFor(() => expect(sent).toEqual([{ method: "PATCH", url: "/api/v1/assets/ast_archived", body: { status: "active" } }]));
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  },
});

/** A phone: the frequent few, the rest under More. */
export const Phone = meta.story({
  globals: { viewport: { value: "phone" } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More" }));
    await expect(await screen.findByRole("menuitem", { name: /Expiry/ })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  },
});
