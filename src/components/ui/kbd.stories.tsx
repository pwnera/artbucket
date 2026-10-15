import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

/** A key or a chord, as the person presses it: "mod" is the Command key on a Mac and Ctrl elsewhere. */
const meta = preview.meta({
  title: "App/Primitives/Kbd",
  component: Kbd,
  args: { keys: ["mod", "K"] },
});

export const Playground = meta.story({
  play: async ({ canvas }) => {
    // The test browser's platform decides the glyph; either way it is one <kbd>.
    await expect(canvas.getByText(/^(⌘K|Ctrl\+K)$/)).toHaveAttribute("data-slot", "kbd");
  },
});

export const Keys = meta.story({
  render: () => (
    <div className="flex items-center gap-3 text-sm">
      <span>
        Search <Kbd keys={["mod", "K"]} />
      </span>
      <Separator orientation="vertical" className="h-4" />
      <span>
        Upload <Kbd keys={["U"]} />
      </span>
      <Separator orientation="vertical" className="h-4" />
      <span>
        <Kbd keys={["G"]} /> then a letter
      </span>
    </div>
  ),
});

/** In a tooltip it turns to the tooltip's colors on its own. */
export const InTooltip = meta.story({
  render: () => (
    <Tooltip defaultOpen>
      <TooltipTrigger asChild>
        <Button variant="ghost">Search</Button>
      </TooltipTrigger>
      <TooltipContent>
        Search <Kbd keys={["mod", "K"]} className="ml-2" />
      </TooltipContent>
    </Tooltip>
  ),
});

export const Dark = Keys.extend({ globals: { theme: "dark" } });
