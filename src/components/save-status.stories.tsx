import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { SaveStatus } from "@/components/save-status";
import { track } from "@/lib/saving";

/** A write that waits until the story ends, then lands, so the tab's store is idle for the next one. */
const pending = () => {
  let land = () => {};
  void track(new Promise<object>((done) => (land = () => done({}))));
  return () => land();
};

const meta = preview.meta({
  title: "App/Patterns/Save status",
  component: SaveStatus,
  args: { fallback: "Edited 2 minutes ago" },
});

/** Idle: what the slot says otherwise. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Edited 2 minutes ago")).toBeInTheDocument();
  },
});

/** A write in flight (lib/saving's track(), which send() calls for every non-GET). */
export const Saving = meta.story({
  beforeEach: pending,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Saving")).toBeInTheDocument();
  },
});

/** A write landed: Saved, which fades after a moment. */
export const Saved = meta.story({
  play: async ({ canvas }) => {
    await track(Promise.resolve({}));
    await expect(await canvas.findByText("Saved")).toBeInTheDocument();
  },
});

/** A write failed (send() resolved null): Not saved, until a later write lands. */
export const Failed = meta.story({
  play: async ({ canvas }) => {
    await track(Promise.resolve(null));
    await expect(await canvas.findByText("Not saved")).toBeInTheDocument();
    await track(Promise.resolve({}));
    await expect(await canvas.findByText("Saved")).toBeInTheDocument();
  },
});
