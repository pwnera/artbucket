import preview from "#.storybook/preview";
import { fontUrl } from "#.storybook/fixtures/patterns";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { FontPlayground, FontStyleChip, FontStyles, FontThumb, GoogleFontImport } from "@/components/font-preview";
import { AssetUrl } from "@/components/site/asset-url";

/**
 * Every asset id loads the fixture face (Nunito Sans), but "slow" never arrives and "broken" isn't a font. Each
 * story takes ids of its own: a page loads a face once, by id.
 */
const url = (id: string) => (id.startsWith("slow") ? `/a/${id}` : id.startsWith("broken") ? "/logos/agents/figma.svg" : fontUrl);

/** What the controls below hand on, heard by the plays; cleared before each story. */
const removed = fn();
const added = fn();
const done = fn();

const meta = preview.meta({
  title: "App/Patterns/Font preview",
  component: FontPlayground,
  args: { id: "ast_play", flow: true },
  decorators: [(Story) => <AssetUrl value={url}>{Story()}</AssetUrl>],
  beforeEach: ({ msw }) => {
    [removed, added, done].forEach((f) => f.mockClear());
    msw.use(http.get("/a/*", () => delay("infinite")));
    sessionStorage.removeItem("artbucket:font-sample");
  },
});

/** The playground: your words over a size waterfall and the character set; size, weight and italic to try. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    const sample = await canvas.findByRole("textbox", { name: "Sample text" });
    await userEvent.clear(sample);
    await userEvent.type(sample, "Acme Display");
    await expect(canvas.getAllByText("Acme Display").length).toBeGreaterThan(6);
    await userEvent.click(canvas.getByRole("button", { name: "Italic" }));
    await expect(canvas.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getByRole("slider", { name: /Weight/ })).toHaveAttribute("aria-valuetext", "Regular");
  },
});

/** In a type section, from the page's own words: nothing kept from one visit to the next. */
export const WithSample = meta.story({
  args: { id: "ast_sample", sample: "Brand in motion" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("textbox", { name: "Sample text" })).toHaveValue("Brand in motion");
  },
});

/** On the way: a skeleton in its place. */
export const Loading = meta.story({ args: { id: "slow_play" } });

/** A file the browser can't read: said plainly. */
export const Unreadable = meta.story({
  args: { id: "broken_play" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("This browser can't read this font file.")).toBeInTheDocument();
  },
});

/** A card's thumbnail: "Aa" in the face, a skeleton while it loads, the type icon when it can't be read. */
export const Thumbs = meta.story({
  render: () => (
    <div className="flex gap-3">
      {["ast_thumb", "slow_thumb", "broken_thumb"].map((id) => (
        <div key={id} className="bg-muted/40 relative grid size-24 place-items-center overflow-hidden rounded-lg border">
          <FontThumb id={id} className="text-4xl" />
        </div>
      ))}
    </div>
  ),
});

const files = [
  { id: "ast_light", filename: "AcmeSans-Light.woff2" },
  { id: "ast_regular", filename: "AcmeSans-Regular.woff2" },
  { id: "ast_italic", filename: "AcmeSans-Italic.woff2" },
  { id: "ast_bold", filename: "AcmeSans-Bold.woff2" },
];

/** A font rule's files: how many styles, from which weight to which, each a chip to download. */
export const Styles = meta.story({
  render: () => <FontStyles files={files} />,
  play: async ({ canvas, userEvent }) => {
    const fold = canvas.getByRole("button", { name: /4 styles · Light to Bold, with italics/ });
    await expect(fold).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByRole("link", { name: "Download Bold" })).toHaveAttribute("download");
    await userEvent.click(fold);
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
  },
});

/** Licensed for show, not for taking: chips without downloads. */
export const StylesShownOnly = meta.story({
  render: () => <FontStyles files={files} download={false} />,
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
  },
});

/** A family of more than eight folds to its one line. */
export const StylesFolded = meta.story({
  render: () => (
    <FontStyles
      files={["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"].map((w) => ({ id: `ast_${w}`, filename: `AcmeSans-${w}.woff2` }))}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /9 styles/ })).toHaveAttribute("aria-expanded", "false");
  },
});

/** Editing: each chip comes off the rule, and more can be added. */
export const StylesEditing = meta.story({
  render: () => <FontStyles files={files} onRemove={removed} onAdd={added} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Take Bold off the rule" }));
    await expect(removed).toHaveBeenCalledWith("ast_bold");
    await userEvent.click(canvas.getByRole("button", { name: "Add font files" }));
    await expect(added).toHaveBeenCalledOnce();
  },
});

/** One chip, set in its own style. */
export const StyleChip = meta.story({ render: () => <FontStyleChip id="ast_chip" filename="AcmeSans-SemiBoldItalic.woff2" download /> });

const FAMILIES = [
  { family: "Inter", category: "sans-serif", styles: ["100", "400", "700", "400i"] },
  { family: "Lora", category: "serif", styles: ["400", "700"] },
  { family: "JetBrains Mono", category: "monospace", styles: ["400"] },
];

/** Search Google Fonts, see each family in your words, import the ones the brand uses. */
export const GoogleFonts = meta.story({
  render: () => <GoogleFontImport onDone={done} />,
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/fonts/google", ({ request }) => {
        const q = new URL(request.url).searchParams.get("q")?.toLowerCase() ?? "";
        const data = FAMILIES.filter((f) => f.family.toLowerCase().includes(q));
        return HttpResponse.json({ data, total: q ? data.length : 1_700 });
      }),
      http.post("/api/v1/fonts/google", async () => {
        await delay(200);
        return HttpResponse.json({ family: "Lora", data: [{ id: "ast_lora_400" }, { id: "ast_lora_700" }] });
      }),
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Google Fonts/ }));
    const dialog = await screen.findByRole("dialog", { name: "Google Fonts" });
    await expect(await within(dialog).findByText("The 3 most popular of 1700. Search to narrow it.")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole("searchbox", { name: "Search Google Fonts" }), "lora");
    await waitFor(() => expect(within(dialog).queryByText("Inter")).not.toBeInTheDocument());
    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));
    await expect(await screen.findByText("Imported Lora")).toBeInTheDocument();
    await expect(within(dialog).getByRole("button", { name: "Imported" })).toBeDisabled();
    await expect(done).toHaveBeenCalledWith(["ast_lora_400", "ast_lora_700"], "Lora");
  },
});

/** A search that matches nothing. */
export const GoogleFontsNoMatch = meta.story({
  render: () => <GoogleFontImport open onOpenChange={() => {}} onDone={() => {}} />,
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/fonts/google", () => HttpResponse.json({ data: [], total: 0 }))),
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Google Fonts" });
    await userEvent.type(within(dialog).getByRole("searchbox", { name: "Search Google Fonts" }), "acme");
    await expect(await within(dialog).findByText("No family matches “acme”.")).toBeInTheDocument();
  },
});
