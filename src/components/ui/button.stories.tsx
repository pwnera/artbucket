import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { IconDownload, IconPlus, IconTrash } from "@/components/icons";
import { Button } from "@/components/ui/button";

const VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;
const SIZES = ["xs", "sm", "default", "lg"] as const;

const meta = {
  title: "App/Button",
  component: Button,
  args: { children: "Release", variant: "default", size: "default", disabled: false, pending: false },
  argTypes: { variant: { control: "select", options: VARIANTS }, size: { control: "select", options: [...SIZES, "icon", "icon-xs", "icon-sm", "icon-lg"] } },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {VARIANTS.map((v) => (
        <Button key={v} variant={v}>
          {v}
        </Button>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
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
};

/** Working, not unavailable: full strength, a spinner, the label kept. */
export const Pending: Story = { args: { pending: true } };
export const Disabled: Story = { args: { disabled: true } };
