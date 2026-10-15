import preview from "#.storybook/preview";
import { acme, me, NOW, viewer, withMe } from "#.storybook/fixtures/brands";
import { delay, http, HttpResponse } from "msw";
import { toast } from "sonner";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { type BrandComment, CommentBadge, CommentsPanel, type CommentThread, useComments } from "@/components/builder/comments";
import { sendResult } from "@/lib/send";

const transport = (method: string, url: string, body?: unknown) => sendResult(method, url, body, { quiet: true });

const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const comment = (c: Partial<BrandComment> & Pick<BrandComment, "id" | "body">): BrandComment => ({
  page: "logo",
  section: null,
  parent: null,
  author: "Grace Hopper",
  authorId: "usr_grace",
  mine: false,
  resolvedAt: null,
  resolvedBy: null,
  editedAt: null,
  createdAt: ago(90),
  updatedAt: ago(90),
  ...c,
});

const ROOT = "0b6a1c1e-0000-4000-8000-000000000001";
const OWN = "0b6a1c1e-0000-4000-8000-000000000002";
const DONE = "0b6a1c1e-0000-4000-8000-000000000003";

/** GET .../comments on Acme's Logo page: a thread on its clear space section with a reply, one of Ada's on the page, one resolved. */
const threads: CommentThread[] = [
  {
    ...comment({ id: ROOT, section: "clear-space", body: "Is half the mark's height enough clear space on print?" }),
    replies: [comment({ id: "0b6a1c1e-0000-4000-8000-000000000011", parent: ROOT, author: "Ada Lovelace", authorId: "usr_ada", mine: true, body: "On print, the full height.", createdAt: ago(30) })],
  },
  { ...comment({ id: OWN, author: "Ada Lovelace", authorId: "usr_ada", mine: true, body: "The 2019 logo still shows on the cover.", createdAt: ago(5) }), replies: [] },
  { ...comment({ id: DONE, body: "Swap the favicon too.", resolvedAt: ago(60), resolvedBy: "Ada Lovelace", createdAt: ago(60 * 24 * 3) }), replies: [] },
];

const URL_ = "/api/v1/brands/acme/comments";
/** Each write the panel sent, as method, path and body. */
let sent: { method: string; url: string; body: unknown }[] = [];
const record = async (request: Request) =>
  sent.push({ method: request.method, url: new URL(request.url).pathname, body: request.method === "DELETE" ? null : await request.json() });

/** The panel on its own useComments, as the guidelines reader places it. */
function Panel({ section, onPickSection }: { section: string | null; onPickSection(id: string): void }) {
  const comments = useComments("acme", acme, transport);
  return (
    <CommentsPanel
      comments={comments}
      page="logo"
      section={section}
      onPickSection={onPickSection}
      sectionName={(id) => (id === "clear-space" ? "Clear space" : undefined)}
      className="max-w-md"
    />
  );
}

const meta = preview.meta({
  title: "App/Features/Builder/Comments",
  component: Panel,
  args: { section: null, onPickSection: fn() },
  argTypes: { section: { control: "select", options: [null, "clear-space"] } },
  decorators: [withMe(me)],
  beforeEach: ({ msw }) => {
    sent = [];
    // Times read "5 minutes ago" against the fixtures' noon, never today. Swapped by hand: a spy's own
    // bookkeeping reads Date.now, and would call itself.
    const now = Date.now;
    Date.now = () => NOW.getTime();
    msw.use(
      http.get(URL_, () => HttpResponse.json({ data: threads })),
      http.post(URL_, async ({ request }) => {
        await record(request);
        const b = sent.at(-1)!.body as { page?: string; section?: string; parent?: string; body: string };
        const parent = b.parent ?? null;
        await delay(100);
        return HttpResponse.json(
          { data: comment({ id: "0b6a1c1e-0000-4000-8000-0000000000ff", page: "logo", section: b.section ?? null, parent, body: b.body, author: "Ada Lovelace", authorId: "usr_ada", mine: true, createdAt: NOW.toISOString() }) },
          { status: 201 },
        );
      }),
      http.patch(`${URL_}/:id`, async ({ request, params }) => {
        await record(request);
        const was = threads.find((t) => t.id === params.id)!;
        const b = sent.at(-1)!.body as { resolved?: boolean };
        return HttpResponse.json({ data: { ...was, replies: undefined, resolvedAt: b.resolved ? NOW.toISOString() : null, resolvedBy: b.resolved ? "Ada Lovelace" : null } });
      }),
      http.delete(`${URL_}/:id`, async ({ request }) => {
        await record(request);
        return HttpResponse.json({ data: { deleted: true } });
      }),
    );
    return () => {
      Date.now = now;
      toast.dismiss();
    };
  },
});

/** A page's threads, open ones first, with a box for a new comment on top; resolved ones behind a switch. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await expect(await canvas.findByText("2 open threads")).toBeInTheDocument();
    await expect(canvas.queryByText("Swap the favicon too.")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("switch", { name: "Show resolved (1)" }));
    await expect(canvas.getByText("Swap the favicon too.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Clear space" }));
    await expect(args.onPickSection).toHaveBeenCalledWith("clear-space");
  },
});

/** Post a comment on the page: shown at once while it is on its way, sent as page and body. */
export const Post = meta.story({
  play: async ({ canvas, userEvent }) => {
    const box = await canvas.findByRole("textbox", { name: "Comment on this page" });
    await userEvent.type(box, "  Can the wordmark go in Ink?  ");
    await userEvent.click(canvas.getByRole("button", { name: "Comment" }));
    await expect(box).toHaveValue("");
    await expect(canvas.getByText("Can the wordmark go in Ink?")).toBeInTheDocument();
    await waitFor(() => expect(sent).toEqual([{ method: "POST", url: URL_, body: { page: "logo", body: "Can the wordmark go in Ink?" } }]));
    await expect(await canvas.findByText("3 open threads")).toBeInTheDocument();
  },
});

/** On one section: only its threads, and a new comment is pinned to it. */
export const OnASection = meta.story({
  args: { section: "clear-space" },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("1 open thread")).toBeInTheDocument();
    await userEvent.type(canvas.getByRole("textbox", { name: "Comment on this section" }), "Print needs more.{Meta>}{Enter}{/Meta}");
    await waitFor(() => expect(sent).toEqual([{ method: "POST", url: URL_, body: { page: "logo", section: "clear-space", body: "Print needs more." } }]));
  },
});

/** Reply in a thread: sent with its parent. */
export const Reply = meta.story({
  play: async ({ canvas, userEvent }) => {
    const thread = (await canvas.findByText("Is half the mark's height enough clear space on print?")).closest("article")!;
    await userEvent.type(within(thread).getByRole("textbox", { name: "Reply" }), "Agreed, the full height.");
    await userEvent.click(within(thread).getByRole("button", { name: "Reply" }));
    await waitFor(() => expect(sent).toEqual([{ method: "POST", url: URL_, body: { parent: ROOT, body: "Agreed, the full height." } }]));
    await expect(await within(thread).findByText("Agreed, the full height.")).toBeInTheDocument();
  },
});

/** Resolve a thread: it leaves the open ones, sent as resolved. */
export const Resolve = meta.story({
  play: async ({ canvas, userEvent }) => {
    const thread = (await canvas.findByText("The 2019 logo still shows on the cover.")).closest("article")!;
    await userEvent.click(within(thread).getByRole("button", { name: "Resolve the thread" }));
    await waitFor(() => expect(sent).toEqual([{ method: "PATCH", url: `${URL_}/${OWN}`, body: { resolved: true } }]));
    await expect(await canvas.findByText("1 open thread")).toBeInTheDocument();
    await expect(canvas.queryByText("The 2019 logo still shows on the cover.")).not.toBeInTheDocument();
  },
});

/** Delete one's own comment, after a confirm. */
export const Delete = meta.story({
  play: async ({ canvas, userEvent }) => {
    const thread = (await canvas.findByText("The 2019 logo still shows on the cover.")).closest("article")!;
    await userEvent.click(within(thread).getByRole("button", { name: "Comment actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Delete the comment?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(sent).toEqual([{ method: "DELETE", url: `${URL_}/${OWN}`, body: null }]));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await expect(canvas.queryByText("The 2019 logo still shows on the cover.")).not.toBeInTheDocument();
  },
});

/** The server refuses a comment: taken back, the toast says why, and the text is back in the box to send again. */
export const PostRefused = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.post(URL_, async () => {
        await delay(100);
        return HttpResponse.json({ error: { code: "invalid", message: "That page is gone." } }, { status: 422 });
      }),
    ),
  play: async ({ canvas, userEvent }) => {
    const box = await canvas.findByRole("textbox", { name: "Comment on this page" });
    await userEvent.type(box, "Is this still current?");
    await userEvent.click(canvas.getByRole("button", { name: "Comment" }));
    await expect(await screen.findByText("Couldn't post the comment")).toBeInTheDocument();
    await expect(screen.getByText("That page is gone.")).toBeInTheDocument();
    await waitFor(() => expect(box).toHaveValue("Is this still current?"));
  },
});

/** Before the first answer. */
export const Loading = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get(URL_, () => delay("infinite"))),
});

/** The comments can't be read: why, and Try again. */
export const ReadError = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get(URL_, () => HttpResponse.json({ error: { message: "Brand not found" } }, { status: 404 }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Brand not found")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  },
});

export const Empty = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get(URL_, () => HttpResponse.json({ data: [] }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No comments on this page yet.")).toBeInTheDocument();
  },
});

/** Every thread settled. */
export const AllResolved = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get(URL_, () => HttpResponse.json({ data: threads.slice(2) }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Every thread on this page is resolved.")).toBeInTheDocument();
  },
});

/** Someone who may only read: the threads, no box to write in, no resolve, no menu. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("2 open threads")).toBeInTheDocument();
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Resolve the thread" })).not.toBeInTheDocument();
  },
});

/** A long comment with no spaces breaks inside its card. */
export const LongComment = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get(URL_, () =>
        HttpResponse.json({
          data: [
            {
              ...comment({ id: ROOT, author: "Maximiliana Theodora Featherstonehaugh-Wolfeschlegel", body: `See https://acme.test/brand/${"logo-usage-guidelines-".repeat(6)}final and ${"the long part of this note keeps going. ".repeat(8)}` }),
              replies: [],
            },
          ],
        }),
      ),
    ),
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

/** The pill a section wears: its open threads, or the icon alone, a way in to the first comment. */
export const Badge = meta.story({
  render: () => (
    <div className="flex gap-2">
      <CommentBadge count={0} onClick={fn()} />
      <CommentBadge count={3} onClick={fn()} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Comment" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "3 open comments" })).toBeInTheDocument();
  },
});
