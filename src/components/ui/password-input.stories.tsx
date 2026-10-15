import preview from "#.storybook/preview";
import { expect, fn } from "storybook/test";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

/** A password field that can be shown, says when Caps Lock is on, and hides again when its form submits. */
const meta = preview.meta({
  title: "App/Primitives/Password input",
  component: PasswordInput,
  args: { id: "pw", placeholder: "At least 10 characters", disabled: false, onChange: fn() },
  argTypes: { showLength: { control: "number" } },
  render: (args) => (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="pw">Password</Label>
      <PasswordInput {...args} />
    </div>
  ),
});

export const Playground = meta.story({
  play: async ({ canvas, canvasElement, userEvent }) => {
    const field = canvasElement.querySelector<HTMLInputElement>("#pw")!;
    await userEvent.type(field, "correct horse");
    await expect(field).toHaveAttribute("type", "password");
    const show = canvas.getByRole("button", { name: "Show password" });
    await userEvent.click(show);
    await expect(field).toHaveAttribute("type", "text");
    await expect(show).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(show);
    await expect(field).toHaveAttribute("type", "password");
    await expect(show).toHaveAttribute("aria-pressed", "false");
  },
});

/** A length rule as a live count, ticked once it is met. */
export const ShowLength = meta.story({
  args: { showLength: 10 },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const field = canvasElement.querySelector<HTMLInputElement>("#pw")!;
    await userEvent.type(field, "1234567");
    await expect(canvas.getByText("7 of 10 characters")).toBeInTheDocument();
    await expect(field).toHaveAccessibleDescription(/7 of 10 characters/);
    await userEvent.type(field, "890");
    await expect(canvas.getByText("10+ characters")).toBeInTheDocument();
  },
});

export const CapsLock = meta.story({
  play: async ({ canvas, canvasElement, userEvent }) => {
    const field = canvasElement.querySelector<HTMLInputElement>("#pw")!;
    await userEvent.click(field);
    await userEvent.keyboard("{CapsLock}a");
    await expect(await canvas.findByText("Caps Lock is on")).toBeInTheDocument();
    await userEvent.tab();
    await expect(canvas.queryByText("Caps Lock is on")).not.toBeInTheDocument();
  },
});

/** Shown, then the form submits: it hides again, so the password is not left on screen. */
export const HidesOnSubmit = meta.story({
  render: (args) => (
    <form className="grid max-w-sm gap-2" onSubmit={(e) => e.preventDefault()}>
      <Label htmlFor="pw">Password</Label>
      <PasswordInput {...args} />
      <Button type="submit" className="justify-self-start">
        Sign in
      </Button>
    </form>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const field = canvasElement.querySelector<HTMLInputElement>("#pw")!;
    await userEvent.type(field, "correct horse");
    await userEvent.click(canvas.getByRole("button", { name: "Show password" }));
    await expect(field).toHaveAttribute("type", "text");
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
    await expect(field).toHaveAttribute("type", "password");
  },
});

export const Invalid = meta.story({ args: { "aria-invalid": true, defaultValue: "short" } });

export const Disabled = meta.story({ args: { disabled: true } });

export const Dark = meta.story({ args: { showLength: 10, defaultValue: "correct" }, globals: { theme: "dark" } });
