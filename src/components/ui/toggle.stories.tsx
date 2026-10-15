import preview from "#.storybook/preview";
import { expect, fn } from "storybook/test";
import { IconBold, IconStar } from "@/components/icons";
import { Toggle } from "@/components/ui/toggle";

/** A button that stays pressed: a filter on or off, a format applied. A setting saved at once is a Switch. */
const meta = preview.meta({
  title: "App/Primitives/Toggle",
  component: Toggle,
  args: { children: "Only approved", variant: "default", size: "default", disabled: false, onPressedChange: fn() },
  argTypes: {
    variant: { control: "inline-radio", options: ["default", "outline"] },
    size: { control: "inline-radio", options: ["sm", "default", "lg"] },
  },
});

export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const t = canvas.getByRole("button", { name: "Only approved" });
    await userEvent.click(t);
    await expect(t).toHaveAttribute("aria-pressed", "true");
    await expect(args.onPressedChange).toHaveBeenLastCalledWith(true);
    // Space and Enter both press it.
    await userEvent.keyboard(" ");
    await expect(t).toHaveAttribute("aria-pressed", "false");
    await userEvent.keyboard("{Enter}");
    await expect(t).toHaveAttribute("aria-pressed", "true");
  },
});

/** On: the accent's wash, its label in the accent's ink. */
export const Pressed = meta.story({ args: { defaultPressed: true } });

export const Outline = meta.story({ args: { variant: "outline", defaultPressed: true } });

/** Icon only: it needs a name (`aria-label`). */
export const Icon = meta.story({
  args: { "aria-label": "Bold", children: <IconBold /> },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Bold" })).toBeInTheDocument();
  },
});

export const Sizes = meta.story({
  render: (args) => (
    <div className="flex items-center gap-2">
      {(["sm", "default", "lg"] as const).map((s) => (
        <Toggle key={s} {...args} size={s} variant="outline" defaultPressed={s === "default"}>
          <IconStar /> {s}
        </Toggle>
      ))}
    </div>
  ),
});

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvas }) => {
    // pointer-events: none, so no click reaches it; and no Tab stop.
    await expect(canvas.getByRole("button")).toBeDisabled();
  },
});

export const Dark = Sizes.extend({ globals: { theme: "dark" } });
