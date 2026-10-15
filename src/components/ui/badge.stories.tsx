import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { IconCircleCheck } from "@/components/icons";
import { Badge } from "@/components/ui/badge";

const VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "success", "warning", "link"] as const;

/** A short status or count beside what it describes: an asset's review state, a plan, a count of waiting items. */
const meta = preview.meta({
  title: "App/Primitives/Badge",
  component: Badge,
  args: { children: "Approved", variant: "default", asChild: false },
  argTypes: { variant: { control: "select", options: VARIANTS } },
});

export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Approved")).toHaveAttribute("data-variant", "default");
  },
});

export const Variants = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-2">
      {VARIANTS.map((v) => (
        <Badge key={v} variant={v}>
          {v}
        </Badge>
      ))}
    </div>
  ),
});

/** An icon leads; it takes the badge's color and size. */
export const WithIcon = meta.story({
  args: { variant: "success", children: (<><IconCircleCheck /> Cleared for web</>) as never },
});

/** `asChild` makes a link look like a badge: it then underlines or tints on hover. */
export const AsLink = meta.story({
  args: { asChild: true, variant: "outline", children: <a href="#review">3 waiting for review</a> },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "3 waiting for review" })).toHaveAttribute("data-slot", "badge");
  },
});

/** Never wraps: a long label stays on one line, so give it room or shorten it. */
export const LongText = meta.story({
  args: { variant: "secondary", children: "Shared with the press portal until 30 November" },
});

export const Dark = Variants.extend({ globals: { theme: "dark" } });
