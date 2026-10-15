import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A field's name. Point it at the field (`htmlFor`), or wrap the control, so a click on it reaches the field. */
const meta = preview.meta({
  title: "App/Primitives/Label",
  component: Label,
  args: { children: "Product name", htmlFor: "name" },
  render: (args) => (
    <div className="grid max-w-sm gap-2">
      <Label {...args} />
      <Input id="name" defaultValue="Artbucket" />
    </div>
  ),
});

export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Product name"));
    await expect(canvas.getByRole("textbox", { name: "Product name" })).toHaveFocus();
  },
});

/** Wrapping a checkbox: the whole line toggles it. */
export const Wrapping = meta.story({
  render: () => (
    <Label>
      <Checkbox /> Ask readers to accept the terms
    </Label>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Ask readers to accept the terms"));
    await expect(canvas.getByRole("checkbox", { name: "Ask readers to accept the terms" })).toBeChecked();
  },
});

/** Beside a disabled control (a peer), it fades with it. */
export const Disabled = meta.story({
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="terms" disabled />
      <Label htmlFor="terms">Ask readers to accept the terms</Label>
    </div>
  ),
});
