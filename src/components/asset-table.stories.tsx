import preview from "#.storybook/preview";
import { useState } from "react";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { assets, byId, inApp, library } from "#.storybook/fixtures/library";
import { AssetTable } from "@/components/asset-table";
import type { Asset } from "@/components/gallery";
import type { Patch } from "@/components/selection-bar";

/**
 * The table as the library holds it: the selection, the row that takes Tab, and the page's copy that a decision
 * takes rows out of (and Undo puts back). Arrows move, X selects, as the grid's keys do.
 */
function Table({ rows, review = false, initial = [], onOpen = fn() }: { rows: Asset[]; review?: boolean; initial?: string[]; onOpen?: (a: Asset) => void }) {
  const [list, setList] = useState(rows);
  const [selected, setSelected] = useState(new Set(initial));
  const [cursor, setCursor] = useState<string | null>(null);
  const pick = (a: Asset) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(a.id)) next.add(a.id);
      return next;
    });
  const patch: Patch = (ids, f) => {
    const was = list;
    setList((l) => l.flatMap((a) => (ids.includes(a.id) ? (f(a) ?? []) : [a])));
    return () => setList(was);
  };
  return (
    <AssetTable
      assets={list}
      selected={selected}
      selecting={selected.size > 0}
      review={review}
      cursor={cursor}
      well="auto"
      onCursor={setCursor}
      onKeyDown={(e) => {
        const row = e.target as HTMLElement;
        const a = list.find((x) => x.id === row.dataset.cursor);
        if (!a) return;
        const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
        if (step) {
          e.preventDefault();
          const to = (step > 0 ? row.nextElementSibling : row.previousElementSibling) as HTMLElement | null;
          to?.focus();
        } else if (e.key === "x") pick(a);
        else if (e.key === "Enter") onOpen(a);
      }}
      menu={() => ({ onOpen: fn(), onShare: fn(), onChanged: fn() })}
      onOpen={onOpen}
      onPick={pick}
      patch={patch}
      onChanged={fn()}
    />
  );
}

/**
 * The library as rows (AssetTable): denser than the grid, the right shape for deciding. In Review each row says who
 * suggested it and decides it in place: A approves, R rejects, and a decision can be undone for 8s.
 */
const meta = preview.meta({
  title: "App/Features/Library/Asset table",
  decorators: [inApp],
  parameters: { layout: "fullscreen" },
  beforeEach: ({ msw }) => void msw.use(...library()),
  render: () => (
    <div className="p-4">
      <Table rows={assets} />
    </div>
  ),
});

/** Every kind of file, with its state, version and suggestions. */
export const Default = meta.story({
  play: async ({ canvas }) => {
    const table = canvas.getByRole("table");
    await expect(within(table).getAllByRole("row")).toHaveLength(assets.length + 1);
    await expect(within(table).getByText("Replaced")).toBeInTheDocument();
  },
});

/** Arrows move between rows, X selects, Enter opens; the row is the one tab stop. */
export const Keyboard = meta.story({
  args: { onOpen: fn() },
  render: (args) => (
    <div className="p-4">
      <Table rows={assets.slice(0, 4)} onOpen={args.onOpen} />
    </div>
  ),
  play: async ({ args, canvas, userEvent }) => {
    const rows = canvas.getAllByRole("row").slice(1);
    rows[0].focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(rows[1]).toHaveFocus();
    await userEvent.keyboard("x");
    await expect(canvas.getByRole("checkbox", { name: "Select acme-logo.svg" })).toBeChecked();
    await expect(rows[1]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(args.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "ast_icon_star" }));
  },
});

/** Selected rows, tinted, with their boxes ticked; a click on a row now selects rather than opens. */
export const Selected = meta.story({
  render: () => (
    <div className="p-4">
      <Table rows={assets.slice(0, 5)} initial={["ast_hero", "ast_mark"]} />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select acme-logo.svg" }));
    await expect(canvas.getAllByRole("checkbox", { checked: true })).toHaveLength(3);
  },
});

/** Review: who suggested each, the evidence it came with, and A or R to decide. A decision waits out its Undo. */
export const Review = meta.story({
  render: () => (
    <div className="p-4">
      <Table rows={[byId("ast_ai"), { ...byId("ast_hero"), proposedTags: ["outdoor", "city"] }, { ...byId("ast_mark"), status: "proposed", state: "proposed", proposedBy: "web", version: 2 }]} review />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Missing: model release")).toBeInTheDocument();
    const first = canvas.getAllByRole("row")[1];
    first.focus();
    await userEvent.keyboard("a");
    await waitFor(() => expect(canvas.getAllByRole("row")).toHaveLength(3));
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(canvas.getAllByRole("row")).toHaveLength(4));
  },
});

/** Reject with a reason, from the row's own button. */
export const RejectWithReason = meta.story({
  render: () => (
    <div className="p-4">
      <Table rows={[byId("ast_ai")]} review />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Reject…" }));
    await userEvent.type(await screen.findByRole("textbox", { name: "Reason for rejecting" }), "The logo is cropped");
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(canvas.getAllByRole("row")).toHaveLength(1));
  },
});

/** A viewer in Review: who suggested what, without the decisions. */
export const ReviewForViewer = meta.story({
  parameters: { app: { scope: "read" } },
  render: () => (
    <div className="p-4">
      <Table rows={[byId("ast_ai")]} review />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
  },
});

/** Nothing to show: the head alone (the library shows its own empty state instead). */
export const Empty = meta.story({
  render: () => (
    <div className="p-4">
      <Table rows={[]} />
    </div>
  ),
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
