import preview from "#.storybook/preview";
import { failingTheme, theme } from "#.storybook/fixtures/brand-pages";
import { assetFiles, recorder, rules } from "#.storybook/fixtures/brands";
import { useState } from "react";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { ThemeEditor, ThemePanel } from "@/components/theme-panel";
import { Button } from "@/components/ui/button";
import { LOOKS } from "@/lib/brand-theme";

const sent = recorder();
const THEME = "/api/v1/brands/acme/theme";

/** The theme with `settings` set by hand. */
const set = (settings: Record<string, unknown>) => ({ ...theme, settings }) as typeof theme;

/** A Select's options are portaled: pick `option` from the one named `name`, and wait for it to go. */
async function choose(userEvent: { click: (e: Element) => Promise<void> }, canvas: { getByRole: typeof screen.getByRole }, name: string | RegExp, option: string | RegExp) {
  await userEvent.click(canvas.getByRole("combobox", { name }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
}

/**
 * How a brand's pages look: a style (a look, which sets the layout at once), which rule plays the accent and the
 * faces, the logo and device, the layout, links beside search, and every pair of text and ground graded. Each change
 * saves on its own (PATCH .../theme, a draft until released); the builder docks it and takes each change instead.
 */
const meta = preview.meta({
  title: "App/Features/Brands/Theme panel",
  component: ThemeEditor,
  args: { slug: "acme", theme, active: true, onSaved: fn() },
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
  beforeEach: ({ msw }) => {
    sent.reset();
    msw.use(assetFiles, sent.on("get", "/api/v1/brand/rules", rules), sent.on("patch", THEME, {}));
  },
});

/** Acme's theme, drawn from its rules, nothing set by hand: every slot Automatic. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("radiogroup", { name: "Style" })).toBeInTheDocument();
    await waitFor(() => expect(sent.last("GET")?.path).toBe("/api/v1/brand/rules?brand=acme"));
    await expect(canvas.getByRole("combobox", { name: "Accent" })).toHaveTextContent("Automatic");
  },
});

/** The looks are one stop: arrows move between the cards without saving, Enter picks one, and its layout is saved whole. */
export const PickALookWithTheKeyboard = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    canvas.getByRole("radio", { name: /Documentation/ }).focus();
    await userEvent.keyboard("{ArrowRight>}");
    await waitFor(() => expect(canvas.getByRole("radio", { name: /Editorial/ })).toHaveFocus());
    await userEvent.keyboard("{/ArrowRight}");
    await expect(sent.last("PATCH")).toBeUndefined();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: THEME, body: LOOKS.editorial.patch }));
    await expect(canvas.getByRole("radio", { name: /Editorial/ })).toBeChecked();
    await waitFor(() => expect(args.onSaved).toHaveBeenCalledOnce());
  },
});

/** The accent is a rule of the brand's: picked by name with its swatch, or left Automatic (null clears it). */
export const PickTheAccent = meta.story({
  play: async ({ canvas, userEvent }) => {
    await waitFor(() => expect(sent.last("GET")).toBeDefined());
    await choose(userEvent, canvas, "Accent", /Signal/);
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ accent: "color.accent" }));
    await choose(userEvent, canvas, "Accent", "Automatic");
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ accent: null }));
  },
});

/** The faces: a font rule each, its family beside its name. */
export const PickTheFaces = meta.story({
  play: async ({ canvas, userEvent }) => {
    await waitFor(() => expect(sent.last("GET")).toBeDefined());
    await choose(userEvent, within(canvas.getByRole("region", { name: "Type" })), "Text", /Body/);
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ body: "font.body" }));
  },
});

/** Layout: width, navigation and header as segments; the rest folded under what it is set to. */
export const Layout = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "Wide" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ width: "wide" }));
    // Header says it all: band, which says less, is cleared.
    await userEvent.click(canvas.getByRole("radio", { name: "Beside cover" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ header: "split", band: null }));
    await userEvent.click(canvas.getByText("More layout"));
    await userEvent.click(canvas.getByRole("switch", { name: "Number chapters and pages" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ numbering: !theme.numbering }));
    await choose(userEvent, canvas, "Corner radius", "16px");
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ radius: 16 }));
  },
});

/** A link beside search: saved once its row is left with a label and an http address; anything else is marked. */
export const Links = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add a link" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "Label" }), "GitHub");
    await userEvent.type(canvas.getByRole("textbox", { name: "Address" }), "ftp://acme.test");
    await expect(canvas.getByRole("textbox", { name: "Address" })).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Add a link" }));
    // Half filled: nothing saved.
    await expect(sent.last("PATCH")).toBeUndefined();
    await userEvent.click(canvas.getAllByRole("button", { name: "Remove the link" })[0]);
    const [label] = canvas.getAllByRole("textbox", { name: "Label" });
    await userEvent.type(label, "GitHub");
    await userEvent.type(canvas.getByRole("textbox", { name: "Address" }), "https://github.com/acme/brand");
    await userEvent.tab();
    await userEvent.tab();
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ links: [{ label: "GitHub", url: "https://github.com/acme/brand" }] }));
  },
});

/** A device set by hand: shown, replaced from the library, or removed. */
export const Device = meta.story({
  args: { theme: set({ device: "ast_logo" }) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Device"));
    await expect(canvas.getByRole("img", { name: "The device" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ device: null }));
  },
});

/** A rule the theme names that is gone: kept in the list, said missing, until another is picked. */
export const MissingRule = meta.story({
  args: { theme: set({ accent: "color.retired" }) },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole("combobox", { name: "Accent" })).toHaveTextContent("color.retired (missing)"));
  },
});

/** Two pairs that fall short: said above, and each one graded with the color that stands in. */
export const ContrastFallsShort = meta.story({
  args: { theme: failingTheme },
  // Each pair's sample is drawn in the brand's own colors, the failing ones on purpose: that is what it shows.
  parameters: { a11y: { test: "todo" } },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("2 pairs fall short; a color that reads stands in.")).toBeInTheDocument();
    await userEvent.click(canvas.getByText("Every pair"));
    await expect(canvas.getByText("#c2410c")).toBeInTheDocument();
  },
});

/** The save refused: the API's words, and the setting as it was. */
export const SaveFails = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", THEME, { code: "invalid", message: "That look needs a heading face" }, 422)),
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: /Swiss/ }));
    await expect(await screen.findByText("That look needs a heading face")).toBeInTheDocument();
    await waitFor(() => expect(canvas.getByRole("radio", { name: /Swiss/ })).not.toBeChecked());
    await expect(args.onSaved).not.toHaveBeenCalled();
  },
});

/** Docked in the builder: its rules given, nothing fetched, and each change handed over (an undoable op) rather than saved. */
export const InTheBuilder = meta.story({
  args: { rules, onPatch: fn(), onSaved: undefined },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: /Playful/ }));
    await expect(args.onPatch).toHaveBeenCalledWith(LOOKS.playful.patch);
    await expect(sent.calls).toHaveLength(0);
  },
});

/** In the reader, a sheet beside the page: each change saves, and the page behind re-themes. */
export const Sheet = meta.story({
  render: function Render(args) {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Theme</Button>
        <ThemePanel slug={args.slug} theme={args.theme} onSaved={args.onSaved} open={open} onOpenChange={setOpen} />
      </>
    );
  },
  play: async ({ canvas, userEvent }) => {
    const sheet = await screen.findByRole("dialog", { name: "Theme" });
    await expect(within(sheet).getByText("Saved as a draft until released.")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    // Given time: on a busy machine the headless browser's exit animation can outlast waitFor's one second.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 5000 });
    await expect(canvas.getByRole("button", { name: "Theme" })).toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" } });
