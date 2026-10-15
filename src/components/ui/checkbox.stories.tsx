import preview from "#.storybook/preview";
import { expect, fn } from "storybook/test";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/** One setting of a form, saved with the form; or picking items of a list. A setting that applies at once is a Switch. */
const meta = preview.meta({
  title: "App/Primitives/Checkbox",
  component: Checkbox,
  args: { id: "terms", disabled: false, "aria-invalid": false, onCheckedChange: fn() },
  argTypes: { checked: { control: "select", options: [undefined, true, false, "indeterminate"] } },
  render: (args) => (
    <div className="flex items-center gap-2">
      <Checkbox {...args} />
      <Label htmlFor="terms">Ask readers to accept the terms</Label>
    </div>
  ),
});

export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const box = canvas.getByRole("checkbox", { name: "Ask readers to accept the terms" });
    await userEvent.click(box);
    await expect(box).toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(true);
    // Space toggles it from the keyboard; Enter does not (a checkbox is not a button).
    await userEvent.keyboard(" ");
    await expect(box).not.toBeChecked();
    await userEvent.keyboard("{Enter}");
    await expect(box).not.toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenCalledTimes(2);
  },
});

export const Checked = meta.story({ args: { defaultChecked: true } });

/** Some of a list picked: the "select all" of a list whose items are partly selected. */
export const Indeterminate = meta.story({
  args: { checked: "indeterminate" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("checkbox")).toHaveAttribute("aria-checked", "mixed");
  },
});

export const Disabled = meta.story({
  args: { disabled: true, defaultChecked: true },
  play: async ({ args, canvas, userEvent }) => {
    const box = canvas.getByRole("checkbox");
    await expect(box).toBeDisabled();
    await userEvent.click(box);
    await expect(args.onCheckedChange).not.toHaveBeenCalled();
  },
});

export const Invalid = meta.story({
  args: { "aria-invalid": true },
  render: (args) => (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Checkbox {...args} aria-describedby="terms-error" />
        <Label htmlFor="terms">I accept the terms</Label>
      </div>
      <p id="terms-error" className="text-destructive text-xs">
        Accept the terms to download.
      </p>
    </div>
  ),
});

export const Dark = meta.story({
  globals: { theme: "dark" },
  render: () => (
    <div className="grid gap-3">
      {([false, true, "indeterminate"] as const).map((c) => (
        <Label key={String(c)}>
          <Checkbox checked={c} /> {String(c)}
        </Label>
      ))}
    </div>
  ),
});
