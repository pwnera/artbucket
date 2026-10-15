import preview from "#.storybook/preview";
import { expect, fn } from "storybook/test";
import { IconDownload, IconPlus, IconTrash } from "@/components/icons";
import { Button } from "@/components/ui/button";

const VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;
const SIZES = ["xs", "sm", "default", "lg"] as const;

const meta = preview.meta({
  title: "App/Primitives/Button",
  component: Button,
  args: { children: "Release", variant: "default", size: "default", disabled: false, pending: false, onClick: fn() },
  argTypes: { variant: { control: "select", options: VARIANTS }, size: { control: "select", options: [...SIZES, "icon", "icon-xs", "icon-sm", "icon-lg"] } },
});

export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Release" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
    // Enter and Space press it from the keyboard.
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    await expect(args.onClick).toHaveBeenCalledTimes(3);
  },
});

export const Variants = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-2">
      {VARIANTS.map((v) => (
        <Button key={v} variant={v}>
          {v}
        </Button>
      ))}
    </div>
  ),
});

export const Sizes = meta.story({
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {SIZES.map((s) => (
        <Button key={s} size={s}>
          <IconPlus /> {s}
        </Button>
      ))}
      <Button size="icon" aria-label="Download">
        <IconDownload />
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label="Delete">
        <IconTrash />
      </Button>
    </div>
  ),
});

/** Working, not unavailable: full strength, a spinner, the label kept, and no second click. */
export const Pending = meta.story({
  args: { pending: true },
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: /Release/ });
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(button).toBeDisabled();
  },
});

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Release" })).toBeDisabled();
  },
});

/** A link that looks like a button (`asChild`): still a link to a screen reader, and it opens a new tab as links do. */
export const AsLink = meta.story({
  args: { asChild: true, variant: "outline", children: <a href="#docs">Read the docs</a> },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Read the docs" })).toHaveAttribute("data-slot", "button");
  },
});

/** Pending with a leading icon: the spinner takes the icon's place. */
export const PendingWithIcon = meta.story({
  args: { pending: true, children: (<><IconDownload /> Download</>) as never },
});

/** Never wraps: a long label widens the button, so keep labels to a few words. */
export const LongText = meta.story({ args: { children: "Release version 37 to every portal and site" } });

export const Dark = Variants.extend({ globals: { theme: "dark" } });
