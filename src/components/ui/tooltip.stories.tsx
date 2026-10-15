import preview from "#.storybook/preview";
import { expect, screen, waitFor } from "storybook/test";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A short hint on hover or focus: an icon button's name, a date in full, a shortcut. Never the only place for
 * something a person needs (touch has no hover): that belongs on the page or in a Popover.
 */
const meta = preview.meta({
  title: "App/Primitives/Tooltip",
  component: Tooltip,
  args: { delayDuration: 400 },
  render: (args) => (
    <Tooltip {...args}>
      <TooltipTrigger asChild>
        <Button variant="ghost">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>Released Monday at 08:00</TooltipContent>
    </Tooltip>
  ),
});

export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.hover(canvas.getByRole("button", { name: "Hover me" }));
    await expect(await screen.findByRole("tooltip")).toHaveTextContent("Released Monday at 08:00");
    await userEvent.unhover(canvas.getByRole("button", { name: "Hover me" }));
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  },
});

/** Focus from the keyboard shows it too, and it describes the trigger; Escape hides it. */
export const Keyboard = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    const trigger = canvas.getByRole("button", { name: "Hover me" });
    await expect(trigger).toHaveFocus();
    await screen.findByRole("tooltip");
    await expect(trigger).toHaveAccessibleDescription("Released Monday at 08:00");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
  },
});

/** With a shortcut: the Kbd takes the tooltip's colors. */
export const WithShortcut = meta.story({
  args: { defaultOpen: true },
  render: (args) => (
    <Tooltip {...args}>
      <TooltipTrigger asChild>
        <Button variant="ghost">Search</Button>
      </TooltipTrigger>
      <TooltipContent>
        Search <Kbd keys={["mod", "K"]} className="ml-2" />
      </TooltipContent>
    </Tooltip>
  ),
});

export const Sides = meta.story({
  render: () => (
    <div className="flex gap-16 p-12">
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Tooltip key={side} defaultOpen>
          <TooltipTrigger asChild>
            <Button variant="outline">{side}</Button>
          </TooltipTrigger>
          <TooltipContent side={side}>On the {side}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  ),
});

export const LongText = meta.story({
  args: { defaultOpen: true },
  render: (args) => (
    <Tooltip {...args}>
      <TooltipTrigger asChild>
        <Button variant="ghost">Why is this locked?</Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        This logo was replaced by version 4 on 2 October. Ask an editor of the Acme brand to restore it.
      </TooltipContent>
    </Tooltip>
  ),
});

export const Dark = WithShortcut.extend({ globals: { theme: "dark" } });
