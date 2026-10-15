import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { Separator } from "@/components/ui/separator";

/** A hairline between groups. Decorative by default (hidden from screen readers); `decorative={false}` makes it a separator they announce. */
const meta = preview.meta({
  title: "App/Primitives/Separator",
  component: Separator,
  args: { orientation: "horizontal", decorative: true },
  argTypes: { orientation: { control: "inline-radio", options: ["horizontal", "vertical"] } },
  render: (args) => (
    <div className={args.orientation === "vertical" ? "flex h-6 items-center gap-3 text-sm" : "grid max-w-xs gap-3 text-sm"}>
      <span>Assets</span>
      <Separator {...args} />
      <span>Collections</span>
    </div>
  ),
});

export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("separator")).not.toBeInTheDocument();
  },
});

export const Vertical = meta.story({ args: { orientation: "vertical" } });

/** Announced: it separates two sections a reader should know apart. */
export const Semantic = meta.story({
  args: { decorative: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("separator")).toHaveAttribute("data-orientation", "horizontal");
  },
});
