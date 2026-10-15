import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { asset } from "#.storybook/fixtures/library";
import { LinkImport, Lottie } from "@/components/media";

let posted: unknown[] = [];

/**
 * Add a link (LinkImport): a Figma file or a Google Doc, Sheet, Slides deck or Drive file, kept as the link and shown
 * as the service's embed. The link is checked as it is typed, so a wrong one never costs a round trip.
 */
const meta = preview.meta({
  title: "App/Features/Library/Media",
  component: LinkImport,
  args: { open: true, onOpenChange: fn(), onDone: fn(), into: null, defaultValue: "" },
  beforeEach: ({ msw }) => {
    posted = [];
    msw.use(
      http.post("/api/v1/assets", async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json({ data: asset({ id: "ast_deck", filename: "Q4 launch deck", mime: "text/uri-list" }) });
      }),
    );
  },
});

/** A Google Slides link: named as it is typed, then added into the collection open. */
export const Playground = meta.story({
  args: { into: "col_campaign" },
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Add a link" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Link" }), "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit");
    await expect(within(dialog).getByText("Google Slides file")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(args.onDone).toHaveBeenCalledWith(["ast_deck"]));
    await expect(posted).toEqual([{ url: "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit", collections: ["col_campaign"] }]);
  },
});

/** Not a link it keeps: said beside the field, and Add waits. */
export const WrongLink = meta.story({
  args: { defaultValue: "https://example.com/brand.pdf" },
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await expect(within(dialog).getByText("That isn't a Figma, Google Docs, Sheets, Slides or Drive link")).toBeInTheDocument();
    await expect(within(dialog).getByRole("button", { name: "Add" })).toBeDisabled();
  },
});

/** A Figma link pasted onto the page: the dialog opens with it. */
export const Pasted = meta.story({
  args: { defaultValue: "https://www.figma.com/design/AbC123/Homepage" },
  play: async () => {
    await expect(await screen.findByText("Figma file")).toBeInTheDocument();
  },
});

/** A Lottie that can't play: says so, rather than an empty canvas. */
export const LottieBroken = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/a/broken.lottie", () => new HttpResponse(null, { status: 404 }))),
  render: () => (
    <div className="relative size-48 rounded-lg border">
      <Lottie src="/a/broken.lottie" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("This animation can't play", undefined, { timeout: 5000 })).toBeInTheDocument();
  },
});
