import preview from "#.storybook/preview";
import { expect, fn, screen, waitFor } from "storybook/test";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

/**
 * A small panel anchored to what opened it, the page still usable around it: who can see this, a quick field.
 * Interactive content, unlike a Tooltip; no page dimmed, unlike a Dialog.
 */
const meta = preview.meta({
  title: "App/Primitives/Popover",
  component: Popover,
  args: { modal: false, onOpenChange: fn() },
  render: (args) => (
    <Popover {...args}>
      <PopoverTrigger asChild>
        <Button variant="outline">Who can see this?</Button>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>3 people and 1 portal</PopoverTitle>
          <PopoverDescription>The brand team, and the press portal until 30 November.</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  ),
});

export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Who can see this?" });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    // Its title names it.
    await expect(await screen.findByRole("dialog", { name: "3 people and 1 portal" })).toHaveTextContent("The brand team");
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true);
    // Escape closes it and gives focus back to the trigger.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
  },
});

/** A click outside closes it too. */
export const ClickOutside = meta.story({
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Who can see this?" }));
    await screen.findByRole("dialog");
    await userEvent.click(canvasElement.ownerDocument.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** A field inside: focus moves into it on open, Enter submits, Escape gives focus back. */
export const WithField = meta.story({
  render: (args) => (
    <Popover {...args}>
      <PopoverTrigger asChild>
        <Button variant="outline">Rename</Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Rename">
        <form className="grid gap-2" onSubmit={(e) => e.preventDefault()}>
          <Label htmlFor="rename">Collection name</Label>
          <Input id="rename" defaultValue="Spring campaign" />
        </form>
      </PopoverContent>
    </Popover>
  ),
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Rename" });
    await userEvent.click(trigger);
    const field = await screen.findByRole("textbox", { name: "Collection name" });
    await userEvent.tab();
    await expect(field).toHaveFocus();
    await userEvent.clear(field);
    await userEvent.type(field, "Autumn launch");
    await expect(field).toHaveValue("Autumn launch");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  },
});

export const Phone = meta.story({ args: { defaultOpen: true }, globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ args: { defaultOpen: true }, globals: { theme: "dark" } });
