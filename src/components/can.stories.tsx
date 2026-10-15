import preview from "#.storybook/preview";
import { editor, me, viewer, withMe } from "#.storybook/fixtures/brands";
import { expect } from "storybook/test";
import { AccessProvider, Can, useCan, Writable } from "@/components/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACTIONS, type Action } from "@/lib/permissions";

const meta = preview.meta({
  title: "App/Patterns/Can",
  component: Can,
  args: { do: "asset.delete" as const, children: <Button variant="destructive">Delete asset</Button>, otherwise: <p className="text-muted-foreground text-sm">Only editors can delete assets.</p> },
  argTypes: { do: { control: "select", options: Object.keys(ACTIONS) }, children: { control: false }, otherwise: { control: false } },
});

/** An editor may: the control shows. */
export const Playground = meta.story({
  decorators: [withMe(editor)],
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Delete asset" })).toBeInTheDocument();
  },
});

/** A viewer may not: `otherwise` in its place (nothing, when left out). */
export const NotAllowed = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Delete asset" })).not.toBeInTheDocument();
    await expect(canvas.getByText("Only editors can delete assets.")).toBeInTheDocument();
  },
});

/** Outside the provider (signed out, a shared link) nothing is allowed. */
export const OutsideTheApp = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Delete asset" })).not.toBeInTheDocument();
  },
});

const form = (
  <Writable do="asset.edit" why="You can see this asset, not change it.">
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="can-title">Title</Label>
      <Input id="can-title" defaultValue="Acme logo, primary" />
      <Button className="w-fit">Save</Button>
    </div>
  </Writable>
);

/** A form a viewer can only read: its controls disabled, and why said above them. */
export const WritableReadOnly = meta.story({
  decorators: [withMe(viewer)],
  render: () => form,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("You can see this asset, not change it.")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Title")).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
  },
});

/** The same form for an editor: everything enabled, no explanation. */
export const WritableAllowed = meta.story({
  decorators: [withMe(editor)],
  render: () => form,
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Title")).toBeEnabled();
    await expect(canvas.queryByText("You can see this asset, not change it.")).not.toBeInTheDocument();
  },
});

function Checks({ actions }: { actions: Action[] }) {
  const can = useCan();
  return (
    <dl className="grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
      {actions.map((a) => (
        <div key={a} className="contents">
          <dt className="font-mono">{a}</dt>
          <dd>{can(a) ? "Yes" : "No"}</dd>
        </div>
      ))}
    </dl>
  );
}

const SOME: Action[] = ["library.read", "asset.upload", "asset.edit", "brand.publish", "member.manage"];

/** useCan(), asked by the same names the API checks: a viewer, an editor and an admin. */
export const ByRole = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-10">
      {[
        ["Viewer", viewer],
        ["Editor", editor],
        ["Admin", me],
      ].map(([name, who]) => (
        <section key={name as string} className="grid gap-2">
          <h3 className="text-sm font-medium">{name as string}</h3>
          <AccessProvider me={who as typeof me}>
            <Checks actions={SOME} />
          </AccessProvider>
        </section>
      ))}
    </div>
  ),
});
