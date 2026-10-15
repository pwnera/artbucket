import preview from "#.storybook/preview";
import { rules } from "#.storybook/fixtures/brands";
import { http, HttpResponse } from "msw";
import { expect, fn, screen, spyOn, waitFor } from "storybook/test";
import { Editable, ReadOnly, ValueEditor } from "@/components/brand-values";
import { send } from "@/lib/send";
import type { Rule, RuleValue } from "@/lib/rules";

const rule = (key: string) => rules.find((r) => r.key === key && !r.context)!;
const color = rule("color.primary");
const font = rule("font.heading");
const voice = rule("voice.tone");
const dos: Rule = { ...voice, id: "rul_do", key: "voice.do", type: "list", value: ["Say what it does", "Use the reader's words"], label: "Do", usage: null };
const donts: Rule = { ...dos, id: "rul_dont", key: "voice.dont", value: ["Exclamation marks", "Jargon"], label: "Don't" };
const bullets: Rule = { ...dos, id: "rul_words", key: "voice.words", value: ["Plain", "Warm", "Short"], label: "Words" };
const scale: Rule = { ...dos, id: "rul_scale", key: "font.scale", value: [12, 14, 16, 20, 32, 48, 128], label: "Type scale" };
const radius: Rule = { ...dos, id: "rul_radius", key: "shape.radius", type: "number", value: 8, label: "Corner radius" };

let body: unknown;

const meta = preview.meta({
  title: "App/Features/Brands/Values",
  component: ValueEditor,
  args: { rule: color, onSave: fn(), stacked: false },
  parameters: {
    // The contrast samples set "Aa" in the brand's own color on white and on black, to show how it reads: a color that
    // fails is the brand's choice, graded beside it in words. The rest of the editor is held to axe.
    a11y: { context: { exclude: ['[title*=" text on "] > [aria-hidden]'] } },
  },
  argTypes: { rule: { control: "select", options: ["color", "font", "text", "do", "dont", "bullets", "scale", "number"], mapping: { color, font, text: voice, do: dos, dont: donts, bullets, scale, number: radius } } },
  beforeEach: () => {
    body = undefined;
    const clip = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    return () => clip.mockRestore();
  },
});

/** A color, as a rule's editor draws it: the swatch is the picker, the hex is text, the readouts copy, contrast graded. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const hex = canvas.getByRole("textbox", { name: "Hex value" });
    await userEvent.clear(hex);
    // Shorthand and a missing # are still the color: fixed here, not refused.
    await userEvent.type(hex, "f50{Enter}");
    await expect(args.onSave).toHaveBeenCalledWith("#ff5500");
    await expect(canvas.getByText("var(--color-primary)")).toBeInTheDocument();
  },
});

/** A hex that isn't one: the field puts the saved one back and flashes, and nothing is saved. */
export const RefusedHex = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const hex = canvas.getByRole("textbox", { name: "Hex value" });
    await userEvent.clear(hex);
    await userEvent.type(hex, "blue-ish{Enter}");
    await expect(hex).toHaveAttribute("aria-invalid", "true");
    await expect(hex).toHaveValue("#2f62ff");
    await expect(args.onSave).not.toHaveBeenCalled();
  },
});

/**
 * Saved as the Rules tab saves it (PATCH /api/v1/brand/rules), here wired by the story: the value goes out as the
 * rule's `set`.
 */
export const SavedToTheApi = meta.story({
  args: {
    onSave: fn((value: RuleValue) => void send("PATCH", "/api/v1/brand/rules?brand=acme", { set: [{ key: color.key, context: color.context, type: color.type, value }] })),
  },
  beforeEach: ({ msw }) =>
    void msw.use(
      http.patch("/api/v1/brand/rules", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: [] });
      }),
    ),
  play: async ({ canvas, userEvent }) => {
    const hex = canvas.getByRole("textbox", { name: "Hex value" });
    await userEvent.clear(hex);
    await userEvent.type(hex, "#ff5b1f{Enter}");
    await waitFor(() => expect(body).toEqual({ set: [{ key: "color.primary", context: null, type: "color", value: "#ff5b1f" }] }));
  },
});

/** The save refused by the API: its words in a toast. */
export const SaveFails = meta.story({
  args: { onSave: fn((value: RuleValue) => void send("PATCH", "/api/v1/brand/rules?brand=acme", { set: [{ key: color.key, context: null, type: "color", value }] })) },
  beforeEach: ({ msw }) =>
    void msw.use(http.patch("/api/v1/brand/rules", () => HttpResponse.json({ error: { code: "invalid", message: "color.primary is locked by its release" } }, { status: 422 }))),
  play: async ({ canvas, userEvent }) => {
    const hex = canvas.getByRole("textbox", { name: "Hex value" });
    await userEvent.clear(hex);
    await userEvent.type(hex, "#ff5b1f{Enter}");
    await expect(await screen.findByText("color.primary is locked by its release")).toBeInTheDocument();
  },
});

/** A color in a palette grid: the swatch over its readouts. */
export const Stacked = meta.story({ args: { stacked: true } });

/** Read only (a reader, a portal): the swatch copies its hex. */
export const ReadOnlyColor = meta.story({
  decorators: [(Story) => <ReadOnly.Provider value={true}><Story /></ReadOnly.Provider>],
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Copy #2f62ff" }));
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith("#2f62ff");
  },
});

/** A typeface: its family, size and weight, and a specimen (in the family where the reader has it). */
export const Font = meta.story({
  args: { rule: font },
  play: async ({ args, canvas, userEvent }) => {
    const size = canvas.getByRole("textbox", { name: "Size in pixels" });
    await userEvent.clear(size);
    await userEvent.type(size, "40{Enter}");
    await expect(args.onSave).toHaveBeenCalledWith({ family: "Inter", size: 40, weight: 700 });
  },
});

/** A typeface read only: a specimen and a paragraph. */
export const FontReadOnly = meta.story({
  args: { rule: font },
  decorators: [(Story) => <ReadOnly.Provider value={true}><Story /></ReadOnly.Provider>],
});

/** A do list, edited like one: Enter adds an item, and leaving the list saves it. */
export const DoList = meta.story({
  args: { rule: dos },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("textbox", { name: "Item 2" }));
    await userEvent.keyboard("{End}{Enter}");
    await userEvent.type(canvas.getByRole("textbox", { name: "Item 3" }), "Stop when it's said");
    await userEvent.tab();
    await waitFor(() => expect(args.onSave).toHaveBeenCalledWith(["Say what it does", "Use the reader's words", "Stop when it's said"]));
  },
});

export const DontList = meta.story({ args: { rule: donts } });

export const Bullets = meta.story({ args: { rule: bullets } });

/** A type scale: each size set in it, the largest shown at the cap. */
export const Scale = meta.story({ args: { rule: scale } });

/** A type scale read only: a click copies the size. */
export const ScaleReadOnly = meta.story({
  args: { rule: scale },
  decorators: [(Story) => <ReadOnly.Provider value={true}><Story /></ReadOnly.Provider>],
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Copy 16px" }));
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith("16px");
  },
});

/** A number: refused unless it is one. */
export const NumberValue = meta.story({
  args: { rule: radius },
  play: async ({ args, canvas, userEvent }) => {
    const n = canvas.getByRole("textbox", { name: "Value" });
    await userEvent.clear(n);
    await userEvent.type(n, "12{Enter}");
    await expect(args.onSave).toHaveBeenCalledWith(12);
  },
});

/** Words, read only: the rule as the page renders it. */
export const TextReadOnly = meta.story({
  args: { rule: voice },
  decorators: [(Story) => <ReadOnly.Provider value={true}><Story /></ReadOnly.Provider>],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Plain, warm and short. Say what it does, then stop.")).toBeInTheDocument();
  },
});

/** Text that is its own editor: Esc puts the saved text back, Enter commits. */
export const EditableText = meta.story({
  render: () => <Editable value="Acme Blue" label="Name" onSave={saved} className="text-lg font-medium" />,
  play: async ({ canvas, userEvent }) => {
    const name = canvas.getByRole("textbox", { name: "Name" });
    await userEvent.type(name, " (old){Escape}");
    await waitFor(() => expect(name).toHaveValue("Acme Blue"));
    await expect(saved).not.toHaveBeenCalled();
    await userEvent.clear(name);
    await userEvent.type(name, "Ocean{Enter}");
    await expect(saved).toHaveBeenCalledWith("Ocean");
  },
});
const saved = fn();
