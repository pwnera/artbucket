import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, fn, screen } from "storybook/test";
import { me, viewer, withMe } from "../../../.storybook/fixtures/brands";
import { ReaderComments } from "@/components/site/reader-comments";
import { bookView } from "@/components/site/story-site";

const view = bookView("blender", "voice");
const at = "2026-10-14T09:00:00.000Z";
const comment = (id: string, page: string, section: string | null, body: string, extra = {}) => ({
  id,
  page,
  section,
  parent: null,
  body,
  author: "Grace Hopper",
  authorId: "usr_grace",
  mine: false,
  resolvedAt: null,
  resolvedBy: null,
  editedAt: null,
  createdAt: at,
  updatedAt: at,
  replies: [],
  ...extra,
});
const THREADS = [
  comment("00000000-0000-4000-8000-0000000000c1", "voice", "habits", "Can we say \"community\" before \"foundation\"?"),
  comment("00000000-0000-4000-8000-0000000000c2", "voice", null, "The FAQ needs an answer on fan art."),
  comment("00000000-0000-4000-8000-0000000000c3", "color", "palette", "Is the blue's Pantone right?"),
];

/**
 * Review comments in the guidelines reader (`?comments=1`): the threads on the page being read, a click on one's
 * section scrolling to it, then the other pages with open threads, one click away.
 */
const meta = preview.meta({
  title: "Brand site/Parts/Reader comments",
  component: ReaderComments,
  args: { view, brand: { id: "brd_blender" }, open: true, onOpenChange: fn(), onPage: fn() },
  decorators: [withMe(me)],
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/brands/blender/comments", () => HttpResponse.json({ data: THREADS }))),
});

/** Another page's threads are one click away. */
export const Playground = meta.story({
  play: async ({ args, userEvent }) => {
    await expect(await screen.findByText(/fan art/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Color/ }));
    await expect(args.onPage).toHaveBeenCalledWith("color");
  },
});

/** No threads anywhere yet. */
export const Empty = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/brands/blender/comments", () => HttpResponse.json({ data: [] }))),
});

/** A viewer reads them and can't add one. */
export const Viewer = meta.story({ decorators: [withMe(viewer)] });
