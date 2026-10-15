import preview from "#.storybook/preview";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { assets, listing, renditions } from "#.storybook/fixtures/library";
import { LibraryPicker } from "@/components/asset-picker";

/** GET /api/v1/assets?q=: the fixtures whose file name or title has what is typed. */
const search = http.get("/api/v1/assets", ({ request }) => {
  const q = (new URL(request.url).searchParams.get("q") ?? "").toLowerCase();
  return HttpResponse.json(listing(assets.filter((a) => `${a.filename} ${a.metadata?.title ?? ""}`.toLowerCase().includes(q))));
});

/**
 * Pick one asset from the library (LibraryPicker): an image to insert in a guideline page, a theme's logo, a portal's
 * cover, or (with `filter`) any asset, as the editor's Made from does. It says when it is loading and when the
 * library couldn't be reached, rather than looking empty.
 */
const meta = preview.meta({
  title: "App/Features/Library/Asset picker",
  component: LibraryPicker,
  args: { onClose: fn(), onPick: fn() },
  beforeEach: ({ msw }) => void msw.use(...renditions, search),
});

/** Images only, by default: type to search, click to pick. */
export const Playground = meta.story({
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Add an image" });
    await expect(await within(dialog).findByRole("button", { name: "acme-logo.svg" })).toBeInTheDocument();
    // A font has no picture: it isn't offered.
    await expect(within(dialog).queryByRole("button", { name: "AcmeSans-Bold.woff2" })).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Search the library" }), "autumn");
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: "acme-logo.svg" })).not.toBeInTheDocument());
    await userEvent.click(within(dialog).getByRole("button", { name: "autumn-campaign-hero.jpg" }));
    await expect(args.onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "ast_hero" }));
  },
});

/** Any asset, with a title of its own: a font or a zip shows its name where it has no picture. */
export const AnyAsset = meta.story({
  args: { filter: (a) => a.id !== "ast_hero", title: "What was it made from?", description: "The photo an edit started from, the image a model was given." },
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "What was it made from?" });
    await userEvent.click(await within(dialog).findByRole("button", { name: "press-kit.zip" }));
    await expect(args.onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "ast_press" }));
  },
});

/** Still on its way: tiles pulse where the results will be. */
export const Loading = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/assets", () => delay("infinite"))),
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await expect(dialog.querySelector("[aria-busy=true]")).toBeInTheDocument();
  },
});

/** Nothing matches: said, with what was typed. */
export const NothingFound = meta.story({
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Search the library" }), "holiday banner");
    await expect(await within(dialog).findByText("No images found")).toBeInTheDocument();
    await expect(within(dialog).getByText("Nothing matches “holiday banner”. Try fewer words.")).toBeInTheDocument();
  },
});

/** The library couldn't be reached: Retry asks again. */
export const Failed = meta.story({
  beforeEach: ({ msw }) => {
    let calls = 0;
    msw.use(http.get("/api/v1/assets", () => (++calls === 1 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(listing(assets)))));
  },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog");
    await expect(await within(dialog).findByText("Couldn't load the library")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    await expect(await within(dialog).findByRole("button", { name: "acme-logo.svg" })).toBeInTheDocument();
  },
});

/** Tab reaches each tile, Enter picks it; Esc closes without picking. */
export const Keyboard = meta.story({
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("button", { name: "autumn-campaign-hero.jpg" });
    await expect(within(dialog).getByRole("textbox", { name: "Search the library" })).toHaveFocus();
    await userEvent.tab();
    await expect(within(dialog).getByRole("button", { name: "autumn-campaign-hero.jpg" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalledOnce();
    await expect(args.onPick).not.toHaveBeenCalled();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" } });
