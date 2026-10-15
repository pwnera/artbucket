import preview from "#.storybook/preview";
import { expect, screen, waitFor } from "storybook/test";
import { InfoTip } from "@/components/info-tip";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const meta = preview.meta({
  title: "App/Patterns/Info tip",
  component: InfoTip,
  args: { children: "Each file's Rights set this, under Downloads.", label: "More info" },
  argTypes: { side: { control: "select", options: ["top", "bottom", "left", "right"] } },
});

/** A tap opens it, as touch has no hover. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More info" }));
    await expect(await screen.findByRole("tooltip")).toHaveTextContent("Each file's Rights set this, under Downloads.");
  },
});

/** From the keyboard: focus opens it, Esc closes it. */
export const Keyboard = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "More info" })).toHaveFocus();
    await expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  },
});

/** Beside a field's label: a tap reads the tip and leaves the field as it was. */
export const InALabel = meta.story({
  render: (args) => (
    <Label className="flex items-center gap-2">
      <Checkbox /> Search engines may list it <InfoTip {...args} label="About search engines">Only for a public portal.</InfoTip>
    </Label>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "About search engines" }));
    await expect(await screen.findByRole("tooltip")).toHaveTextContent("Only for a public portal.");
    await expect(canvas.getByRole("checkbox")).not.toBeChecked();
  },
});
