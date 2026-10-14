import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/** Every field of the app's forms, as Settings lays them out: a label above, a hint or an error under. */
const meta = { title: "App/Forms" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Fields: Story = {
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
      <Input disabled placeholder="Disabled" />
    </form>
  ),
};
