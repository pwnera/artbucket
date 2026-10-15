import preview from "#.storybook/preview";
import { useState } from "react";
import { expect, fn, waitFor } from "storybook/test";
import { ColorField } from "@/components/color-field";

const meta = preview.meta({
  title: "App/Patterns/Color field",
  component: ColorField,
  args: { value: "#6d4aff", label: "Accent", onChange: fn() },
  // Controlled, as the app holds it: the story keeps the value and reports each change.
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return (
      <ColorField
        {...args}
        value={value}
        onChange={(v) => {
          setValue(v);
          args.onChange(v);
        }}
      />
    );
  },
});

/** A whole hex applies as it is typed. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const hex = canvas.getByRole("textbox", { name: "Accent, hex" });
    await userEvent.clear(hex);
    await userEvent.type(hex, "#14A874");
    await expect(args.onChange).toHaveBeenLastCalledWith("#14a874");
    await expect(canvas.getByLabelText("Accent")).toHaveValue("#14a874");
  },
});

/** Pasted without its #, as design tools copy it. */
export const PastedWithoutHash = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const hex = canvas.getByRole("textbox", { name: "Accent, hex" });
    await userEvent.clear(hex);
    await userEvent.click(hex);
    await userEvent.paste("FF5B1F");
    // Shown as it applies: lowercase, the value the brand keeps.
    await expect(hex).toHaveValue("#ff5b1f");
    await expect(args.onChange).toHaveBeenLastCalledWith("#ff5b1f");
  },
});

/** Left half typed: the field says no for a moment, then shows the color again. */
export const Invalid = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const hex = canvas.getByRole("textbox", { name: "Accent, hex" });
    await userEvent.clear(hex);
    await userEvent.type(hex, "#12");
    await userEvent.tab();
    await expect(hex).toHaveAttribute("aria-invalid", "true");
    await expect(hex).toHaveValue("#6d4aff");
    await expect(args.onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(hex).not.toHaveAttribute("aria-invalid"));
  },
});

/** Named by an outside label (`id`), as a form row does. */
export const WithLabel = meta.story({
  render: (args) => (
    <div className="grid gap-2">
      <label htmlFor="cf-accent" className="text-sm font-medium">
        Accent
      </label>
      <ColorField {...args} id="cf-accent" />
    </div>
  ),
});
