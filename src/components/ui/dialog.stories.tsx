import preview from "#.storybook/preview";
import { useState } from "react";
import { expect, fn, screen, waitFor } from "storybook/test";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * A task that needs the page's full attention: a form to fill, a choice to make. The page dims and waits.
 * A yes-or-no about something lasting is an AlertDialog; details beside the page are a Sheet.
 */
const meta = preview.meta({
  title: "App/Primitives/Dialog",
  component: Dialog,
  args: { modal: true, onOpenChange: fn() },
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger asChild>
        <Button>New collection</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New collection</DialogTitle>
          <DialogDescription>Collections group assets for a campaign, a client or a launch.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
});

const closed = () => waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "New collection" });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "New collection" });
    await expect(dialog).toHaveAccessibleDescription(/group assets/);
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true);
    // Escape closes it, and focus goes back to what opened it.
    await userEvent.keyboard("{Escape}");
    await closed();
    await expect(trigger).toHaveFocus();
  },
});

/** The X closes it too, from the keyboard as well; Tab stays inside while it is open. */
export const FocusTrap = meta.story({
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "New collection" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog");
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await expect(dialog).toContainElement(document.activeElement as HTMLElement);
    const x = screen.getByRole("button", { name: "Close" });
    x.focus();
    await userEvent.keyboard("{Enter}");
    await closed();
    await expect(trigger).toHaveFocus();
  },
});

/** A form dialog with `guard`: Escape in a field only leaves the field; once edited, closing asks first. */
export const Guarded = meta.story({
  args: { onOpenChange: undefined },
  render: function Render() {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>New collection</Button>
        </DialogTrigger>
        <DialogContent guard={{ dirty: name !== "", onDiscard: () => (setName(""), setOpen(false)) }}>
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>Collections group assets for a campaign, a client or a launch.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="collection">Name</Label>
            <Input id="collection" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "New collection" }));
    const field = await screen.findByRole("textbox", { name: "Name" });
    await userEvent.type(field, "Spring campaign");
    await userEvent.keyboard("{Escape}");
    await expect(field).not.toHaveFocus();
    await expect(screen.getByRole("dialog", { name: "New collection" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    const ask = await screen.findByRole("alertdialog", { name: "Discard changes?" });
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(ask).not.toBeInTheDocument());
    await expect(field).toHaveValue("Spring campaign");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(await screen.findByRole("button", { name: "Discard" }));
    await closed();
  },
});

/** Long content scrolls inside the dialog, never past the screen. */
export const LongText = meta.story({
  args: { defaultOpen: true },
  render: (args) => (
    <Dialog {...args}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terms for the press portal</DialogTitle>
          <DialogDescription>Readers accept these before their first download.</DialogDescription>
        </DialogHeader>
        {Array.from({ length: 12 }, (_, i) => (
          <p key={i} className="text-sm">
            {i + 1}. Assets are for editorial use about Acme only. Do not alter the logos, crop the product shots or use them
            to imply an endorsement. Credit the photographer where a credit is given.
          </p>
        ))}
      </DialogContent>
    </Dialog>
  ),
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await expect(dialog.getBoundingClientRect().height).toBeLessThanOrEqual(window.innerHeight);
  },
});

export const Phone = meta.story({ args: { defaultOpen: true }, globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ args: { defaultOpen: true }, globals: { theme: "dark" } });
