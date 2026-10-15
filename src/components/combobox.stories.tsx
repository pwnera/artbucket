import preview from "#.storybook/preview";
import { tagCounts } from "#.storybook/fixtures/patterns";
import { expect, fn, screen, waitFor } from "storybook/test";
import { Combobox, MultiCombobox } from "@/components/combobox";
import { Label } from "@/components/ui/label";

const CHANNELS = ["Web", "Print", "Social", "Out of home"].map((value) => ({ value }));
const TAGS = tagCounts.map((t) => ({ value: t.value, hint: t.count }));

/** What the many-value stories pick, heard by their plays; cleared before each story. */
const picked = fn();

const meta = preview.meta({
  title: "App/Patterns/Combobox",
  beforeEach: () => void picked.mockClear(),
  component: Combobox,
  args: { id: "cb", options: CHANNELS, placeholder: "Choose a channel", required: false, onChange: fn() },
  argTypes: { options: { control: "object" } },
  // As the app names it: a <Label> for its id.
  decorators: [
    (Story) => (
      <div className="grid max-w-xs gap-2">
        <Label htmlFor="cb">Channel</Label>
        {Story()}
      </div>
    ),
  ],
});

/** Open it, type to filter, pick with the keyboard, clear it. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const box = canvas.getByRole("combobox", { name: "Channel" });
    await userEvent.click(box);
    await expect(box).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("pri");
    await waitFor(() => expect(screen.queryByRole("option", { name: "Web" })).not.toBeInTheDocument());
    await userEvent.keyboard("{Enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith("Print");
    await expect(box).toHaveTextContent("Print");
    // Reopened at once, while it still fades out: a fresh search all the same.
    await userEvent.click(box);
    await waitFor(() => expect(box).toHaveAttribute("aria-expanded", "true"));
    await userEvent.click(await screen.findByRole("option", { name: "Clear" }));
    await expect(args.onChange).toHaveBeenLastCalledWith("");
    await expect(box).toHaveTextContent("Choose a channel");
  },
});

/** Arrows move through the list, Enter picks. */
export const Keyboard = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Channel" }));
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith("Social");
  },
});

/** Nothing matches. */
export const NoMatch = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Channel" }));
    await userEvent.keyboard("billboard");
    await expect(await screen.findByText("No match.")).toBeInTheDocument();
    // Back to the list: an empty listbox is ui/command's to name (aria-required-children), not this pattern's.
    await userEvent.clear(screen.getByPlaceholderText("Search"));
    await expect(await screen.findByRole("option", { name: "Web" })).toBeInTheDocument();
  },
});

/** Required: no Clear, and its hidden twin keeps the form from submitting empty. */
export const Required = meta.story({
  args: { required: true, defaultValue: "Web", name: "channel" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Channel" }));
    await screen.findByRole("option", { name: "Web" });
    await expect(screen.queryByRole("option", { name: "Clear" })).not.toBeInTheDocument();
  },
});

/** With hints beside each option (a collection's asset count). */
export const WithHints = meta.story({ args: { options: TAGS, placeholder: "Choose a tag" } });

/** Refused by the form: the error border. */
export const Invalid = meta.story({ args: { "aria-invalid": true } });

const multi = (args: React.ComponentProps<typeof MultiCombobox>) => (
  <div className="grid max-w-sm gap-2">
    <Label htmlFor="tags">Tags</Label>
    <MultiCombobox {...args} id="tags" />
  </div>
);

/** Many values as chips: pick from the list, type a new one, Backspace takes the last off. */
export const Multi = meta.story({
  render: () => multi({ options: TAGS, defaultValue: ["logo"], placeholder: "Add tags", creatable: true, onChange: picked }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Tags" }));
    await userEvent.keyboard("spr{Enter}");
    await expect(picked).toHaveBeenLastCalledWith(["logo", "spring"]);
    await userEvent.keyboard("autumn");
    await expect(await screen.findByRole("option", { name: "Add “autumn”" })).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    await expect(picked).toHaveBeenLastCalledWith(["logo", "spring", "autumn"]);
    await userEvent.keyboard("{Backspace}");
    await expect(picked).toHaveBeenLastCalledWith(["logo", "spring"]);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(canvas.getByRole("button", { name: "Remove logo" }));
    await expect(picked).toHaveBeenLastCalledWith(["spring"]);
  },
});

/** A pasted list adds every piece; a comma finishes a tag. */
export const MultiPaste = meta.story({
  render: () => multi({ options: TAGS, placeholder: "Add tags", creatable: true, onChange: picked }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Tags" }));
    await userEvent.paste("hero, dark; print");
    await expect(picked).toHaveBeenLastCalledWith(["hero", "dark", "print"]);
    await userEvent.keyboard("summer,");
    await expect(picked).toHaveBeenLastCalledWith(["hero", "dark", "print", "summer"]);
  },
});

/** `validate` normalizes what is typed ("de" to "DE") or refuses it, with the hint. */
export const MultiValidated = meta.story({
  render: () =>
    multi({
      options: [{ value: "FR" }, { value: "US" }],
      placeholder: "Add territories",
      creatable: true,
      validate: (v) => (/^[a-z]{2}$/i.test(v) ? v.toUpperCase() : null),
      invalid: "Two-letter country codes, e.g. DE.",
      onChange: picked,
    }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Tags" }));
    await userEvent.keyboard("germany");
    await expect(await screen.findByText("Two-letter country codes, e.g. DE.")).toBeInTheDocument();
    await userEvent.clear(screen.getByPlaceholderText("Search or add"));
    await userEvent.keyboard("de{Enter}");
    await expect(picked).toHaveBeenLastCalledWith(["DE"]);
  },
});

/** A collection the person can't change: its chip stays, with nothing to remove it, and it isn't offered. */
export const MultiLocked = meta.story({
  render: () =>
    multi({
      options: [
        { value: "col_spring", label: "Spring campaign", hint: 24 },
        { value: "col_legal", label: "Legal approved", hint: 310, locked: true },
        { value: "col_print", label: "Print", hint: 18 },
      ],
      defaultValue: ["col_legal", "col_spring"],
    }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Remove Spring campaign" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Remove Legal approved" })).not.toBeInTheDocument();
  },
});

/** Read only: the chips alone. */
export const MultiReadOnly = meta.story({
  render: () => multi({ options: TAGS, defaultValue: ["logo", "print", "spring"], readOnly: true }),
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
  },
});
