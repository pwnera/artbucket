import preview from "#.storybook/preview";
import { expect, fn } from "storybook/test";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/** A one-line text field. Always with a label (a `<Label htmlFor>` or `aria-label`); an error goes under it, tied by `aria-describedby`. */
const meta = preview.meta({
  title: "App/Primitives/Input",
  component: Input,
  args: {
    "aria-label": "Product name",
    placeholder: "Acme",
    type: "text",
    disabled: false,
    readOnly: false,
    "aria-invalid": false,
    onChange: fn(),
    className: "max-w-sm",
  },
  argTypes: { type: { control: "select", options: ["text", "email", "url", "search", "number", "file"] } },
});

export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const input = canvas.getByRole("textbox", { name: "Product name" });
    await userEvent.type(input, "Northwind");
    await expect(input).toHaveValue("Northwind");
    await expect(args.onChange).toHaveBeenCalledTimes(9);
  },
});

/** An error: the red border and ring come from `aria-invalid`, the words from the line under it. */
export const Invalid = meta.story({
  render: () => (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="bad">Logo</Label>
      <Input id="bad" defaultValue="not an asset" aria-invalid aria-describedby="bad-error" />
      <p id="bad-error" className="text-destructive text-xs">
        That isn&apos;t an asset: paste an asset&apos;s link or id, or choose one.
      </p>
    </div>
  ),
  play: async ({ canvas }) => {
    const input = canvas.getByRole("textbox", { name: "Logo" });
    await expect(input).toBeInvalid();
    await expect(input).toHaveAccessibleDescription(/isn't an asset/);
  },
});

export const Disabled = meta.story({
  args: { disabled: true, placeholder: "Disabled" },
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole("textbox");
    await userEvent.type(input, "x");
    await expect(input).toHaveValue("");
  },
});

/** Read-only for a viewer: it can be selected and copied, not changed. */
export const ReadOnly = meta.story({
  args: { readOnly: true, defaultValue: "acme.artbucket.page", "aria-label": "Address" },
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole("textbox", { name: "Address" });
    await userEvent.type(input, "x");
    await expect(input).toHaveValue("acme.artbucket.page");
  },
});

export const LongText = meta.story({
  args: { defaultValue: "Northwind autumn launch, press kit and partner assets for the retail rollout in every region" },
});

export const File = meta.story({ args: { type: "file", "aria-label": "Upload an asset" } });

/** Every field of the app's forms, as Settings lays them out: a label above, a hint or an error under. */
export const Fields = meta.story({
  render: () => (
    <form className="grid max-w-md gap-5" onSubmit={(e) => e.preventDefault()}>
      <div className="grid gap-2">
        <Label htmlFor="name">Product name</Label>
        <Input id="name" defaultValue="Artbucket" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="bad">Logo</Label>
        <Input id="bad" defaultValue="not an asset" aria-invalid aria-describedby="bad-error" />
        <p id="bad-error" className="text-destructive text-xs">
          That isn&apos;t an asset: paste an asset&apos;s link or id, or choose one.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pw">Password</Label>
        <PasswordInput id="pw" placeholder="At least 10 characters" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="footer">Email footer</Label>
        <Textarea id="footer" rows={2} placeholder="Acme Inc, 1 Main Street" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="access">Who gets in</Label>
        <Select defaultValue="public">
          <SelectTrigger id="access" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Anyone with the address</SelectItem>
            <SelectItem value="password">Whoever has the password</SelectItem>
            <SelectItem value="members">People in the project</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Label className="flex items-center gap-2">
        <Checkbox defaultChecked /> Ask readers to accept the terms
      </Label>
      <Label className="flex items-center gap-2">
        <Switch defaultChecked /> Search engines may list it
      </Label>
      <Input disabled placeholder="Disabled" aria-label="Disabled" />
    </form>
  ),
  play: async ({ canvas, userEvent }) => {
    // Tab walks the form in order.
    await userEvent.click(canvas.getByRole("textbox", { name: "Product name" }));
    await userEvent.tab();
    await expect(canvas.getByRole("textbox", { name: "Logo" })).toHaveFocus();
  },
});

export const Phone = Fields.extend({ globals: { viewport: { value: "phone" } } });

export const Dark = Fields.extend({ globals: { theme: "dark" } });
