import preview from "#.storybook/preview";
import { delay, http, HttpResponse } from "msw";
import { expect } from "storybook/test";
import { bookView, StorySite } from "@/components/site/story-site";
import { UpdateList, WhatsNew } from "@/components/site/updates";

const view = bookView("blender", "overview");
const updates = view.updates!;

/**
 * What's new (?view=updates): a brand's releases, newest first, each with its note and picture, and the pages and
 * rules it changed for readers. On a portal from the portal, else from the brand.
 */
const meta = preview.meta({
  title: "Brand site/Parts/What's new",
  component: WhatsNew,
  args: { portal: "blender" },
  decorators: [(Story) => <StorySite view={view}>{Story()}</StorySite>],
});

export const Loaded = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/portal/blender/updates", () => HttpResponse.json({ data: updates, media: view.media }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Release @2")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Using the logo" })).toHaveAttribute("href", "?page=logo-use");
  },
});

/** While it loads. */
export const Loading = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/portal/blender/updates", () => delay("infinite"))),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status", { name: "Loading what's new" })).toBeInTheDocument();
  },
});

/** Never released. */
export const Empty = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Nothing released yet.")).toBeInTheDocument();
  },
});

/** It didn't load. */
export const Failed = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/portal/blender/updates", () => HttpResponse.json({ error: { code: "internal" } }, { status: 500 }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent("didn't load");
  },
});

/** The list alone, as the What's new section draws it on a page. */
export const List = meta.story({ render: () => <UpdateList updates={updates} media={view.media} /> });
