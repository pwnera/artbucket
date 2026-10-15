import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { Fold } from "@/components/fold";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const fields = (
  <>
    <div className="grid gap-2">
      <Label htmlFor="fold-title">Title</Label>
      <Input id="fold-title" defaultValue="Acme brand portal" />
    </div>
    <Label className="flex items-center gap-2">
      <Switch defaultChecked /> Search engines may list it
    </Label>
  </>
);

const meta = preview.meta({
  title: "App/Patterns/Fold",
  component: Fold,
  args: { title: "Search and sharing", summary: "Listed, with a share card", open: false, bare: false, children: fields },
  argTypes: { children: { control: false } },
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
});

/** Closed, its summary says what it is set to; a click or Enter opens it. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    const title = canvas.getByLabelText("Title");
    await expect(title).not.toBeVisible();
    await userEvent.click(canvas.getByText("Search and sharing"));
    await expect(title).toBeVisible();
  },
});

/** Open from the start: something in it wants attention. */
export const Open = meta.story({ args: { open: true } });

/** Bare, in a list of folds inside a panel. */
export const BareList = meta.story({
  render: () => (
    <div className="rounded-lg border px-3">
      <Fold bare title="Downloads" summary="Original and renditions">
        <p className="text-sm">Who may download, and in which formats.</p>
      </Fold>
      <Fold bare title="Access" summary="Anyone with the address">
        <p className="text-sm">Who gets in.</p>
      </Fold>
      <Fold bare title="Domain" summary="brand.acme.test">
        <p className="text-sm">Where it answers.</p>
      </Fold>
    </div>
  ),
});

/** A summary too long for the row: truncated, never wrapped. */
export const LongSummary = meta.story({
  args: { summary: "Listed by search engines, with a share card, a custom favicon and the brand's own fonts" },
  globals: { viewport: { value: "phone" } },
});
