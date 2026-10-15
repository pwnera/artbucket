import preview from "#.storybook/preview";
import { useState } from "react";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { as, assets, byId, collections, fields, library } from "#.storybook/fixtures/library";
import { AssetViewer } from "@/components/asset-viewer";

/** The viewer as the library holds it: the open asset is the URL's, stepping swaps it, closing clears it. */
function Viewer({ start, list = assets, onStep }: { start: string | null; list?: typeof assets; onStep?: (id: string) => void }) {
  const [open, setOpen] = useState(start);
  return (
    <AssetViewer
      asset={list.find((a) => a.id === open) ?? null}
      loading={false}
      assets={list}
      hasMore={false}
      onLoadMore={async () => {}}
      onStep={(id) => {
        onStep?.(id);
        setOpen(id);
      }}
      fields={fields}
      collections={collections}
      onClose={() => setOpen(null)}
      onSaved={fn()}
      onReviewed={fn()}
      onOpen={setOpen}
    />
  );
}

/**
 * The library's asset view (AssetViewer): the editor in a dialog that stays mounted across opening, closing and
 * stepping. ← and → (J and K) step through the loaded assets; a file dropped on it is the asset's next version.
 */
const meta = preview.meta({
  title: "App/Features/Library/Asset viewer",
  decorators: [as],
  parameters: { layout: "fullscreen" },
  beforeEach: ({ msw }) => void msw.use(...library()),
});

/** An approved photo, open: its preview and its panel. → steps to the next asset. */
export const Playground = meta.story({
  args: { onStep: fn() },
  render: (args) => <Viewer start="ast_hero" onStep={args.onStep} />,
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole("dialog");
    await expect(await within(dialog).findAllByText(/Autumn campaign hero/)).not.toHaveLength(0);
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(args.onStep).toHaveBeenCalledWith("ast_logo"));
  },
});

/** A suggestion an agent sent: what came with it, and the decision. */
export const Suggestion = meta.story({ render: () => <Viewer start="ast_ai" /> });

/** The URL names an asset still being fetched: the skeleton. */
export const Loading = meta.story({
  render: () => (
    <AssetViewer
      asset={null}
      loading
      assets={[]}
      hasMore={false}
      onLoadMore={async () => {}}
      onStep={fn()}
      fields={fields}
      collections={collections}
      onClose={fn()}
      onSaved={fn()}
      onReviewed={fn()}
      onOpen={fn()}
    />
  ),
});

/** A viewer: the asset to look at and download, nothing to edit. */
export const ReadOnly = meta.story({ parameters: { app: { scope: "read" } }, render: () => <Viewer start="ast_logo" /> });

/** Esc closes it. */
export const Close = meta.story({
  render: () => <Viewer start="ast_mark" list={[byId("ast_mark")]} />,
  play: async ({ userEvent }) => {
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } }, render: () => <Viewer start="ast_hero" /> });
