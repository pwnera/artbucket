import preview from "#.storybook/preview";
import { expect, fn, screen, waitFor } from "storybook/test";
import RichText from "@/components/rich-text";

/** ⌘ on a Mac, Ctrl elsewhere: tiptap's Mod, as the browser running the story has it. */
const MOD = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "Meta" : "Control";

const meta = preview.meta({
  title: "App/Patterns/Rich text",
  component: RichText,
  args: {
    value: "Use the **primary logo** on light grounds.\n\nKeep clear space of one *x-height* around it.",
    label: "Logo usage",
    onSave: fn(),
    demote: 2,
    required: false,
  },
  argTypes: { style: { control: false } },
  decorators: [(Story) => <div className="max-w-xl pt-12">{Story()}</div>],
});

const editor = () => screen.getByRole("textbox", { name: "Logo usage" });

/** Markdown, edited in place: what it saves is the Markdown, 800ms after the last key or when you leave it. */
export const Playground = meta.story({
  play: async ({ args, userEvent }) => {
    await userEvent.click(editor());
    await userEvent.keyboard(" Never stretch it.");
    await userEvent.click(document.body);
    await waitFor(() => expect(args.onSave).toHaveBeenCalledWith(expect.stringContaining("Never stretch it.")));
  },
});

/** Select text, then a key: bold. The selection's toolbar says it is on. */
export const Bold = meta.story({
  args: { value: "Clear space matters." },
  play: async ({ args, userEvent }) => {
    await userEvent.click(editor());
    await userEvent.keyboard(`{${MOD}>}a{/${MOD}}`);
    await userEvent.keyboard(`{${MOD}>}b{/${MOD}}`);
    await expect(await screen.findByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(document.body);
    await waitFor(() => expect(args.onSave).toHaveBeenCalledWith("**Clear space matters.**"));
  },
});

/** ⌘K on a selection links it; a link that isn't web or email is refused in place. */
export const Link = meta.story({
  args: { value: "Read the brand book." },
  play: async ({ args, userEvent }) => {
    await userEvent.click(editor());
    await userEvent.keyboard(`{${MOD}>}a{/${MOD}}`);
    await userEvent.keyboard(`{${MOD}>}k{/${MOD}}`);
    const field = await screen.findByRole("textbox", { name: "Link" });
    await userEvent.type(field, "javascript:alert(1){Enter}");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(screen.getByText("Only web and email links")).toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.type(field, "brand.acme.test{Enter}");
    await userEvent.click(document.body);
    await waitFor(() => expect(args.onSave).toHaveBeenCalledWith(expect.stringMatching(/\[Read the brand book\.\]\(https:\/\/brand\.acme\.test\/?\)/)));
  },
});

/** Lists from the keyboard: the Markdown shortcuts, or "/" for the blocks menu. */
export const Lists = meta.story({
  args: { value: "" },
  play: async ({ args, userEvent }) => {
    await userEvent.click(editor());
    await userEvent.keyboard("- Logo{Enter}Colors{Enter}{Enter}");
    await userEvent.keyboard("/num");
    await expect(await screen.findByRole("listbox", { name: "Blocks" })).toBeInTheDocument();
    await expect(screen.getByRole("option", { name: /Numbered list/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Enter}Upload{Enter}Release");
    await userEvent.click(document.body);
    await waitFor(() => expect(args.onSave).toHaveBeenCalledWith("- Logo\n- Colors\n\n1. Upload\n2. Release"));
  },
});

/** The "/" menu: every block, with its Markdown shortcut beside it. */
export const SlashMenu = meta.story({
  args: { value: "" },
  play: async ({ userEvent }) => {
    await userEvent.click(editor());
    await userEvent.keyboard("/");
    const menu = await screen.findByRole("listbox", { name: "Blocks" });
    await expect(menu).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}");
    await expect(screen.getByRole("option", { name: /^Heading/ })).toHaveAttribute("aria-selected", "true");
  },
});

/** A text rule: cleared and left, its text comes back, and deleting the rule is offered instead. */
export const Required = meta.story({
  args: { required: true, onEmpty: fn() },
  play: async ({ args, userEvent }) => {
    await userEvent.click(editor());
    await userEvent.keyboard(`{${MOD}>}a{/${MOD}}{Backspace}`);
    await userEvent.click(document.body);
    await expect(await screen.findByText("A text rule needs text")).toBeInTheDocument();
    await expect(editor()).toHaveTextContent("Use the primary logo on light grounds.");
    await expect(args.onSave).not.toHaveBeenCalled();
  },
});

/** Empty: the placeholder says what "/" does. */
export const Empty = meta.story({ args: { value: "", placeholder: "Write the rule, or type / for blocks" } });

/** A table, with its bar for rows and columns once the caret is in it. */
export const Table = meta.story({
  args: { value: "| Use | Size |\n| --- | --- |\n| Web | 24px |\n| Print | 10mm |" },
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByText("Web"));
    await expect(await screen.findByRole("toolbar", { name: "Table" })).toBeInTheDocument();
  },
});
