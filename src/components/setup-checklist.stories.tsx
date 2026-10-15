import preview from "#.storybook/preview";
import { emptyStatus, me, NOW, source, status, viewer, withMe } from "#.storybook/fixtures/brands";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { SetupChecklist } from "@/components/setup-checklist";

/** Kept per person and organization: Ada's, in Acme. */
const KEY = `artbucket:setup:${me.user!.id}:${me.project.organization.id}`;

/** What this browser kept of the setup (its path, whether the first run was seen, hidden), for the story; put back after. */
const stored = (value: object | null) => () => {
  let was: string | null = null;
  try {
    was = localStorage.getItem(KEY);
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {}
  return () => {
    try {
      if (was === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, was);
    } catch {}
  };
};
const kept = () => JSON.parse(localStorage.getItem(KEY) ?? "{}");

/** What the steps are checked off from: Acme's status and repository, and a team of two. */
const facts = (brand = status, repo: typeof source | null = source) => [
  http.get("/api/v1/brands", () => HttpResponse.json({ data: [{ slug: "acme", default: true, rules: 9, createdAt: NOW.toISOString() }] })),
  http.get("/api/v1/brands/acme/status", () => HttpResponse.json({ data: brand })),
  http.get("/api/v1/brands/acme/source", () => HttpResponse.json({ data: repo ?? { source: null, connect: source.connect } })),
  http.get("/api/v1/members", () => HttpResponse.json({ data: [{ id: "usr_ada" }, { id: "usr_grace" }], invitations: [] })),
];

const meta = preview.meta({
  title: "App/Features/Brands/Setup checklist",
  component: SetupChecklist,
  args: { uploaded: false, onUpload: fn() },
  decorators: [withMe(me)],
  beforeEach: ({ msw }) => {
    msw.use(...facts());
    return stored({ welcomed: true, path: "company" })();
  },
});

/** A company's brand, part way: every step but the upload checked off from what the app knows. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await expect(await canvas.findByText("4 of 5")).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Manage my company's brand and assets: on to a released brand" })).toBeInTheDocument();
    await expect(canvas.getByRole("progressbar", { name: "Setup progress" })).toBeInTheDocument();
    // The upload is done where the list is: the library's own.
    await userEvent.click(canvas.getByRole("button", { name: /Upload your first assets/ }));
    await expect(args.onUpload).toHaveBeenCalledOnce();
  },
});

/** The last step checked off while it is on screen: it says so, then folds away. */
export const Completing = meta.story({
  render: function Render() {
    const [uploaded, setUploaded] = useState(false);
    return <SetupChecklist uploaded={uploaded} onUpload={() => setUploaded(true)} />;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /Upload your first assets/ }));
    await expect(await canvas.findByRole("status")).toHaveTextContent("Done: a released brand");
    await waitFor(() => expect(canvas.queryByRole("status")).not.toBeInTheDocument(), { timeout: 5000 });
  },
});

/** Nothing done yet (a new organization): what marks each step is the brand's status, the team and the library. */
export const NothingDone = meta.story({
  // Ada alone: the first handler for an address answers.
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/members", () => HttpResponse.json({ data: [{ id: "usr_ada" }], invitations: [] })), ...facts(emptyStatus, null)),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("0 of 5")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /Set up your brand/ })).toHaveAttribute("href", "/brands/acme/rules");
    await expect(canvas.getByRole("link", { name: /Connect your Git repository/ })).toHaveAttribute("href", me.git);
  },
});

/** No path picked yet (the first run skipped): what do you want to do. */
export const PickAPath = meta.story({
  // Not in Git yet: the path's win still to come.
  beforeEach: ({ msw }) => {
    msw.use(...facts(status, null));
    return stored({ welcomed: true })();
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Build a brand and a design system for my product/ }));
    await expect(await canvas.findByRole("heading", { name: /on to the brand in your code/ })).toBeInTheDocument();
    await expect(kept()).toEqual({ welcomed: true, path: "product" });
    await expect(await canvas.findByText("2 of 3")).toBeInTheDocument();
  },
});

/** Change: back to the paths. */
export const ChangePath = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Change" }));
    await expect(canvas.getByRole("heading", { name: "What do you want to do?" })).toBeInTheDocument();
  },
});

/** Hidden: gone, in this browser, for good. */
export const Dismiss = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Hide setup" }));
    await waitFor(() => expect(canvas.queryByRole("heading")).not.toBeInTheDocument());
    await expect(kept()).toMatchObject({ hidden: true });
  },
});

/** A path just picked, its steps still loading: the card keeps its place. */
export const Loading = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/brands", () => new Promise<Response>(() => {}))),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("region", { busy: true })).toBeInTheDocument();
  },
});

/** The first time, over the whole page: who you are, then that path's steps; Skip for now leaves it for the card. */
export const FirstRun = meta.story({
  beforeEach: stored(null),
  play: async ({ canvas, userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "What do you want to do?" });
    await expect(within(dialog).getByRole("button", { name: "Continue to the library" })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("radio", { name: /Manage my company's brand and assets/ }));
    await expect(within(dialog).getByRole("radio", { name: /Manage my company's brand and assets/ })).toHaveAttribute("aria-checked", "true");
    await expect(await within(dialog).findByText("4 of 5 done")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(kept()).toEqual({ path: "company", welcomed: true });
    await expect(await canvas.findByText("4 of 5")).toBeInTheDocument();
  },
});

/** Escape leaves the first run too, marking it seen. */
export const FirstRunEscape = meta.story({
  beforeEach: stored(null),
  play: async ({ userEvent }) => {
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(kept()).toEqual({ welcomed: true });
  },
});

/** Someone who doesn't manage the organization: nothing. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("heading")).not.toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
