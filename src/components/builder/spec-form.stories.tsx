import preview from "#.storybook/preview";
import { viewRules } from "#.storybook/fixtures/brands";
import { expect, fn, screen, waitFor } from "storybook/test";
import { SpecForm } from "@/components/builder/spec-form";

const meta = preview.meta({
  title: "App/Features/Builder/Spec form",
  component: SpecForm,
  args: { type: "color" as const, spec: null, rules: viewRules, onChange: fn() },
  argTypes: { type: { control: "select", options: ["color", "number", "font", "text", "list"] }, rules: { control: false } },
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
});

/** A color's spec, its fields made from the schema: a field commits on Enter or on leaving it. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Group" }), "Primary{Enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith({ group: "Primary" });
    await userEvent.type(canvas.getByRole("textbox", { name: "CMYK" }), "100, 60, 0, 0");
    await userEvent.tab();
    await expect(args.onChange).toHaveBeenLastCalledWith({ group: "Primary", cmyk: [100, 60, 0, 0] });
  },
});

/** A value that doesn't fit: the field says why and is marked invalid, and nothing is handed on until it does. */
export const Invalid = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const cmyk = canvas.getByRole("textbox", { name: "CMYK" });
    await userEvent.type(cmyk, "100, 60");
    await userEvent.tab();
    await expect(cmyk).toHaveAttribute("aria-invalid", "true");
    await expect(cmyk).toHaveAccessibleDescription(/.+/);
    await expect(args.onChange).not.toHaveBeenCalled();
    // Filled in whole, it is handed on.
    await userEvent.clear(cmyk);
    await userEvent.type(cmyk, "100, 60, 0, 0{Enter}");
    await waitFor(() => expect(cmyk).not.toHaveAttribute("aria-invalid"));
    await expect(args.onChange).toHaveBeenLastCalledWith({ cmyk: [100, 60, 0, 0] });
  },
});

/** A pair naming no color rule: refused here, as the server would. */
export const UnknownPair = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("combobox", { name: "Pair" }), "color.nope{Enter}");
    await expect(canvas.getByRole("alert")).toHaveTextContent("No color rule color.nope: pick one of the list.");
    await expect(args.onChange).not.toHaveBeenCalled();
    await userEvent.clear(canvas.getByRole("combobox", { name: "Pair" }));
    await userEvent.type(canvas.getByRole("combobox", { name: "Pair" }), "color.ink{Enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith({ pair: "color.ink" });
  },
});

/** A gradient, filled stop by stop: what it lacks is said in place, and it is handed on once it has its two stops. */
export const Gradient = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add gradient" }));
    await expect(await canvas.findByText("Needed")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Add stop" }));
    await userEvent.click(canvas.getByRole("button", { name: "Add stop" }));
    const [first, second] = canvas.getAllByRole("combobox", { name: "Color" });
    await userEvent.type(first, "color.primary{Enter}");
    await expect(args.onChange).not.toHaveBeenCalled();
    await userEvent.type(second, "#ffffff{Enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith({ gradient: { stops: [{ color: "color.primary" }, { color: "#ffffff" }] } });
    await userEvent.click(canvas.getByRole("button", { name: "Remove stop 2" }));
    await expect(canvas.getAllByRole("combobox", { name: "Color" })).toHaveLength(1);
  },
});

/** An enum is a select, Not set among its options. */
export const FontRole = meta.story({
  args: { type: "font" },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Role" }));
    await userEvent.click(await screen.findByRole("option", { name: "headline" }));
    await expect(args.onChange).toHaveBeenLastCalledWith({ role: "headline" });
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  },
});

/** A spec as it stands, from the rule: each field shows it. */
export const Filled = meta.story({
  args: { type: "font", spec: { role: "headline", lineHeight: 1.1, tracking: [[12, 0.02], [48, -0.01]], features: ["ss01", "tnum"], source: "google", download: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Tracking" })).toHaveValue("12 0.02, 48 -0.01");
    await expect(canvas.getByRole("textbox", { name: "Features" })).toHaveValue("ss01, tnum");
  },
});

export const NumberSpec = meta.story({ args: { type: "number", spec: { unit: "px", of: "the mark's height" } } });

export const TextSpec = meta.story({ args: { type: "text" } });

/** A type with no spec (a list) draws nothing. */
export const NoSpec = meta.story({
  args: { type: "list" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("input, button")).toBeNull();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
