import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "@/components/ui/badge";

const VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "success", "warning", "link"] as const;

const meta = { title: "App/Badge", component: Badge, args: { children: "Approved", variant: "default" }, argTypes: { variant: { control: "select", options: VARIANTS } } } satisfies Meta<typeof Badge>;
export default meta;

export const Playground: StoryObj<typeof meta> = {};

export const Variants: StoryObj<typeof meta> = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {VARIANTS.map((v) => (
        <Badge key={v} variant={v}>
          {v}
        </Badge>
      ))}
    </div>
  ),
};
