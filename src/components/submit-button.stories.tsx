import preview from "#.storybook/preview";
import { expect, fn, waitFor } from "storybook/test";
import { SubmitButton } from "@/components/submit-button";

const meta = preview.meta({
  title: "App/Patterns/Submit button",
  component: SubmitButton,
  args: { children: "Check", variant: "default", size: "default", pending: false, disabled: false },
  argTypes: {
    variant: { control: "select", options: ["default", "secondary", "outline", "ghost", "destructive", "link"] },
    size: { control: "select", options: ["xs", "sm", "default", "lg"] },
  },
});

export const Playground = meta.story({});

/** In a `<form action>`: pending from the submit until the action settles, with nothing threaded through. */
export const InAForm = meta.story({
  args: { onClick: fn() },
  render: (args) => {
    let finish = () => {};
    return (
      <form
        className="flex items-center gap-2"
        action={() =>
          new Promise<void>((done) => {
            finish = done;
            (window as { finishAction?: () => void }).finishAction = () => finish();
          })
        }
      >
        <SubmitButton {...args} />
      </form>
    );
  },
  play: async ({ canvas, userEvent }) => {
    const button = canvas.getByRole("button", { name: "Check" });
    await userEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    (window as { finishAction?: () => void }).finishAction?.();
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
  },
});

/** Pending from outside too (a client-side save), the same look. */
export const Pending = meta.story({
  args: { pending: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Check" })).toBeDisabled();
  },
});
