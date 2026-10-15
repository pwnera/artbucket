import preview from "#.storybook/preview";
import { expect, fn } from "storybook/test";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** A setting that applies as soon as it flips, with no Save: search engines may list a site, a rule is on. */
const meta = preview.meta({
  title: "App/Primitives/Switch",
  component: Switch,
  args: { id: "index", size: "default", disabled: false, onCheckedChange: fn() },
  argTypes: { size: { control: "inline-radio", options: ["default", "sm"] } },
  render: (args) => (
    <div className="flex items-center gap-2">
      <Switch {...args} />
      <Label htmlFor="index">Search engines may list it</Label>
    </div>
  ),
});

export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const sw = canvas.getByRole("switch", { name: "Search engines may list it" });
    await userEvent.click(sw);
    await expect(sw).toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(true);
    // A switch is a button: Space and Enter both flip it.
    await userEvent.keyboard(" ");
    await expect(sw).not.toBeChecked();
    await userEvent.keyboard("{Enter}");
    await expect(sw).toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenCalledTimes(3);
  },
});

export const On = meta.story({ args: { defaultChecked: true } });

export const Small = meta.story({ args: { size: "sm", defaultChecked: true } });

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("switch"));
    await expect(args.onCheckedChange).not.toHaveBeenCalled();
  },
});

export const Dark = meta.story({
  globals: { theme: "dark" },
  render: () => (
    <div className="grid gap-3">
      <Label>
        <Switch /> Off
      </Label>
      <Label>
        <Switch defaultChecked /> On
      </Label>
      <Label>
        <Switch size="sm" defaultChecked /> Small
      </Label>
    </div>
  ),
});
