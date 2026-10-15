import preview from "#.storybook/preview";
import { source, status } from "#.storybook/fixtures/brands";
import { inApp } from "#.storybook/fixtures/library";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { expect, screen, waitFor } from "storybook/test";
import { BrandImporting, GitReturn } from "@/components/git-return";

/** Back from the Git integration: the address carries ?git=connected, as the integration sends people back. */
const back = () => {
  const was = window.location.href;
  const url = new URL(was);
  url.searchParams.set("git", "connected");
  window.history.replaceState(window.history.state, "", url);
  return () => window.history.replaceState(window.history.state, "", was);
};
const synced = http.get("/api/v1/brands/acme/source", () => HttpResponse.json({ data: { ...source, source: { ...source.source!, pending: false } } }));

const meta = preview.meta({
  title: "App/Features/Brands/Git return",
  component: GitReturn,
  args: { brand: "acme", release: "/brands/acme/releases/new" },
  // The toaster outlives a story: each starts with none.
  beforeEach: async () => {
    toast.dismiss();
    await waitFor(() => expect(document.querySelector("[data-sonner-toast]")).toBeNull());
  },
});

/** Not back from Git and nothing coming in: draws and does nothing. */
export const Playground = meta.story({});

/** The first sync landed, and readers don't see the brand as it stands: the toast offers Release. */
export const Connected = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(synced, http.get("/api/v1/brands/acme/status", () => HttpResponse.json({ data: status })));
    return back();
  },
  play: async ({ userEvent }) => {
    await expect(await screen.findByText("In step with github.com/acme/brand", undefined, { timeout: 4000 })).toBeInTheDocument();
    await expect(screen.getByText("Not released yet. Changes now sync both ways.")).toBeInTheDocument();
    await expect(new URL(window.location.href).searchParams.has("git")).toBe(false);
    await expect(getRouter().replace).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Release" }));
    await expect(getRouter().push).toHaveBeenCalledWith("/brands/acme/releases/new");
  },
});

/** In step, and readers see the brand as it stands: no Release. */
export const ConnectedUpToDate = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(synced, http.get("/api/v1/brands/acme/status", () => HttpResponse.json({ data: { ...status, publish: "current" } })));
    return back();
  },
  play: async () => {
    await expect(await screen.findByText("Changes now sync both ways.", undefined, { timeout: 4000 })).toBeInTheDocument();
    await expect(screen.queryByRole("button", { name: "Release" })).not.toBeInTheDocument();
  },
});

/** The first sync still on its way: a toast that says so while it waits. */
export const Syncing = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/v1/brands/acme/source", () => HttpResponse.json({ data: { ...source, source: { ...source.source!, syncedAt: null } } })));
    return back();
  },
  play: async () => {
    await expect(await screen.findByText("Connecting the repository")).toBeInTheDocument();
    await expect(screen.getByText("The first sync takes a moment.")).toBeInTheDocument();
  },
});

/** A brand still coming in from its repository, drawn again once it lands: quietly, no toast. */
export const Waiting = meta.story({
  args: { waiting: true },
  beforeEach: ({ msw }) => void msw.use(synced),
  play: async () => {
    await waitFor(() => expect(getRouter().replace).toHaveBeenCalled());
    await expect(screen.queryByText(/In step with/)).not.toBeInTheDocument();
  },
});

/** The page of a brand being brought in from its repository, before its first sync lands. */
export const Importing = meta.story({
  render: () => <BrandImporting name="Acme" remote="https://github.com/acme/brand.git" />,
  decorators: [inApp],
  parameters: { layout: "fullscreen" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Loading Acme" })).toBeInTheDocument();
    await expect(canvas.getByText("From github.com/acme/brand")).toBeInTheDocument();
  },
});
