import preview from "#.storybook/preview";
import { emptyStatus, me, status, viewer, withMe } from "#.storybook/fixtures/brands";
import { expect, screen, spyOn, waitFor } from "storybook/test";
import { BrandScore } from "@/components/brand-score";

const meta = preview.meta({
  title: "App/Features/Brands/Score",
  component: BrandScore,
  args: { name: "Acme", slug: "acme", status },
  decorators: [withMe(me)],
});

/** The Agent Score page: the ring, what the next fixes would make it, and every step with its points. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "86 out of 100" })).toBeInTheDocument();
    await expect(canvas.getByText("One fix would get you to 91.")).toBeInTheDocument();
    // A step to do links where it is done; a done one doesn't.
    await expect(canvas.getByRole("link", { name: "Show it on a portal" })).toHaveAttribute("href", "/sites?new=acme");
    await expect(canvas.queryByRole("link", { name: "Add the brand's colors" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /Share public score/ })).toHaveAttribute("href", "https://hub.artbucket.test/score?domain=acme.test");
  },
});

/** Fix with an agent: a prompt for the fixes worth the most, to paste to an agent connected over MCP. */
export const FixWithAnAgent = meta.story({
  args: { status: emptyStatus, name: "Northwind", slug: "northwind" },
  beforeEach: () => {
    const clip = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    return () => clip.mockRestore();
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Two fixes would get you to 35.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Fix with an agent" }));
    await userEvent.click(await screen.findByRole("button", { name: "Copy the prompt" }));
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('Raise the Brand Agent Score of the brand "Northwind" (slug northwind)'));
    await userEvent.click(canvas.getByRole("button", { name: "Fix with an agent" }));
    await waitFor(() => expect(screen.queryByText("Paste this to an agent connected over MCP.")).not.toBeInTheDocument());
  },
});

/** Nothing done yet (Northwind): every step to do, and no public score to share. */
export const Empty = meta.story({ args: { status: emptyStatus, name: "Northwind", slug: "northwind" } });

/** Everything done: nothing to fix. */
export const Complete = meta.story({
  args: { status: { ...status, score: 100, steps: status.steps.map((s) => ({ ...s, done: true, detail: "Done" })) } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Agents can find and use all of Acme.")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Fix with an agent" })).not.toBeInTheDocument();
  },
});

/** A step this person can't see through (a portal they aren't told about): marked not known, no points shown. */
export const NotKnown = meta.story({
  args: { status: { ...status, steps: status.steps.map((s) => (s.id === "portal" ? { ...s, done: null, detail: "Portals this person can't see." } : s)) } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("img", { name: "not known" })).toBeInTheDocument();
    await expect(canvas.getAllByRole("img", { name: "done" })).toHaveLength(7);
  },
});

/** A viewer: the score, without Fix with an agent. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Fix with an agent" })).not.toBeInTheDocument();
  },
});

export const Phone = meta.story({ args: { status: emptyStatus }, globals: { viewport: { value: "phone" } } });
