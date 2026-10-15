import preview from "#.storybook/preview";
import { viewRules } from "#.storybook/fixtures/brands";
import { assets, renditions } from "#.storybook/fixtures/library";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { AssetPicker } from "@/components/builder/asset-picker";
import { sendResult } from "@/lib/send";

const transport = (method: string, url: string, body?: unknown) => sendResult(method, url, body, { quiet: true });

const logo = viewRules.find((r) => r.key === "logo.primary")!;
const heading = viewRules.find((r) => r.key === "font.heading")!;

/** What each search asked for (`q`, null for none). */
let asked: (string | null)[] = [];

/** GET /api/v1/assets?limit=48&q=: the library's assets whose name or title has the words. */
const search = http.get("/api/v1/assets", async ({ request }) => {
  const q = new URL(request.url).searchParams.get("q");
  asked.push(q);
  await delay(50);
  const words = q?.toLowerCase() ?? "";
  return HttpResponse.json({ data: assets.filter((a) => `${a.filename} ${a.metadata?.title ?? ""}`.toLowerCase().includes(words)) });
});

const meta = preview.meta({
  title: "App/Features/Builder/Asset picker",
  component: AssetPicker,
  args: { open: true, rule: logo, onClose: fn(), onSave: fn(), transport },
  argTypes: { rule: { control: false }, transport: { control: false } },
  beforeEach: ({ msw }) => {
    asked = [];
    msw.use(search, ...renditions);
  },
});

/** A rule's assets, picked from the library in order, each at a size: here the Acme logo's. */
export const Playground = meta.story({
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Assets for Logo" });
    await expect(within(dialog).getByRole("group", { name: "Picked, in order" })).toBeInTheDocument();
    await expect(await within(dialog).findByRole("button", { name: "Autumn campaign hero" })).toHaveAttribute("aria-pressed", "false");
    await expect(within(dialog).getByText("1 picked")).toBeInTheDocument();
  },
});

/** Search, pick a second, and Save: the picks in order, as a view describes them, then the picker closes. */
export const SearchAndPick = meta.story({
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Search the library" }), "mark");
    await waitFor(() => expect(asked.at(-1)).toBe("mark"));
    const mark = await within(dialog).findByRole("button", { name: "acme-mark.png" });
    await userEvent.click(mark);
    await expect(mark).toHaveAttribute("aria-pressed", "true");
    await expect(within(dialog).getByText("2 picked")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await expect(args.onSave).toHaveBeenCalledWith([
      logo.assets[0],
      { id: "ast_mark", rendition: null, title: null, filename: "acme-mark.png", mime: "image/png", size: 88_000, width: 1024, height: 1024, preview: true, supersededBy: null },
    ]);
    await expect(args.onClose).toHaveBeenCalled();
  },
});

/** Unpick from the strip of picks. */
export const Unpick = meta.story({
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Unpick Acme logo" }));
    await expect(within(dialog).getByText("0 picked")).toBeInTheDocument();
    await expect(within(dialog).queryByRole("group", { name: "Picked, in order" })).not.toBeInTheDocument();
  },
});

/** A search with nothing in the library. */
export const NothingFound = meta.story({
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Search the library" }), "zebra");
    await expect(await within(dialog).findByText("Nothing found.")).toBeInTheDocument();
  },
});

/** A font rule's files: the search starts from the family, without its spaces. */
export const FontFiles = meta.story({
  args: { rule: heading },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Files for Headings" });
    await expect(within(dialog).getByRole("textbox", { name: "Search the library" })).toHaveValue("Inter");
    await waitFor(() => expect(asked).toEqual(["Inter"]));
  },
});

/** For something other than a rule (a section's items): its own heading. */
export const OwnTitle = meta.story({ args: { rule: { ...logo, assets: [] }, title: "Items for the logo grid", description: "Pick the logos the grid shows, in order." } });

/** Before the first answer. */
export const Loading = meta.story({ beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/assets", () => delay("infinite"))) });

/** The library can't be read: Retry asks again. */
export const LoadFailed = meta.story({
  beforeEach: ({ msw }) => {
    let n = 0;
    msw.use(http.get("/api/v1/assets", () => (++n === 1 ? HttpResponse.json({ error: { message: "Down" } }, { status: 503 }) : HttpResponse.json({ data: assets }))));
  },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog");
    await expect(await within(dialog).findByText("Couldn't load the library.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    await expect(await within(dialog).findByRole("button", { name: "Autumn campaign hero" })).toBeInTheDocument();
  },
});

/** Cancel leaves the rule as it was. */
export const Cancel = meta.story({
  play: async ({ args, userEvent }) => {
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await expect(args.onClose).toHaveBeenCalled();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
