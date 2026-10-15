import preview from "#.storybook/preview";
import { expect, fn, screen, waitFor } from "storybook/test";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const SIDES = ["top", "right", "bottom", "left"] as const;

/**
 * A panel that slides in from an edge: an asset's details, filters, the nav on a phone. For content that belongs
 * beside the page and is longer than a Popover holds; a task to finish is a Dialog.
 */
const meta = preview.meta({
  title: "App/Primitives/Sheet",
  component: Sheet,
  args: { onOpenChange: fn() },
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger asChild>
        <Button variant="outline">Details</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>logo-primary.svg</SheetTitle>
          <SheetDescription>Version 4, approved, cleared for web and print.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Done</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
});

const closed = () => waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Details" });
    await userEvent.click(trigger);
    await screen.findByRole("dialog", { name: "logo-primary.svg" });
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true);
    await userEvent.keyboard("{Escape}");
    await closed();
    await expect(trigger).toHaveFocus();
    // Its own button closes it the same way.
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("button", { name: "Done" }));
    await closed();
    await expect(trigger).toHaveFocus();
  },
});

/** Each side, against its own edge of the screen. */
export const Sides = meta.story({
  render: (args) => (
    <div className="flex gap-2">
      {SIDES.map((side) => (
        <Sheet key={side} {...args}>
          <SheetTrigger asChild>
            <Button variant="outline">{side}</Button>
          </SheetTrigger>
          <SheetContent side={side}>
            <SheetHeader>
              <SheetTitle>From the {side}</SheetTitle>
              <SheetDescription>Filters for the gallery.</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const at = { top: (r: DOMRect) => r.top, left: (r: DOMRect) => r.left, right: (r: DOMRect) => innerWidth - r.right, bottom: (r: DOMRect) => innerHeight - r.bottom };
    for (const side of SIDES) {
      await userEvent.click(canvas.getByRole("button", { name: side }));
      const sheet = await screen.findByRole("dialog", { name: `From the ${side}` });
      await waitFor(() => expect(Math.abs(at[side](sheet.getBoundingClientRect()))).toBeLessThan(1));
      await userEvent.keyboard("{Escape}");
      await closed();
    }
  },
});

export const Phone = meta.story({ args: { defaultOpen: true }, globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ args: { defaultOpen: true }, globals: { theme: "dark" } });
