import preview from "#.storybook/preview";
import { expect, fn, screen, waitFor } from "storybook/test";
import { IconTrash } from "@/components/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * A yes or no before something that lasts: deleting, releasing, revoking. Only its buttons close it: no click
 * outside, no X. Focus starts on Cancel, so Enter never confirms by accident. Undoable actions need no asking: do
 * them and offer Undo in a toast.
 */
const meta = preview.meta({
  title: "App/Primitives/Alert dialog",
  component: AlertDialog,
  args: { onOpenChange: fn() },
  render: (args) => (
    <AlertDialog {...args}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete the portal</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the portal?</AlertDialogTitle>
          <AlertDialogDescription>Its address stops working for everyone. The brands and assets it shows stay.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
});

const closed = () => waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

/** The grouped story's confirm. */
export const Confirm = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Delete the portal" });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("alertdialog", { name: "Delete the portal?" });
    await expect(dialog).toHaveAccessibleDescription(/stops working/);
    await expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await closed();
    await expect(trigger).toHaveFocus();
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false);
  },
});

/** A click outside does nothing: the person must answer. */
export const NoClickOutside = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete the portal" }));
    await screen.findByRole("alertdialog");
    // The page under it takes no pointer: the click lands on the overlay.
    await userEvent.click(document.querySelector<HTMLElement>("[data-slot=alert-dialog-overlay]")!);
    await expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    screen.getByRole("button", { name: "Cancel" }).focus();
    await userEvent.tab();
    await expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await closed();
  },
});

/** Small, with an icon: the buttons share the width. */
export const SmallWithMedia = meta.story({
  args: { defaultOpen: true },
  render: (args) => (
    <AlertDialog {...args}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <IconTrash />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete 3 assets?</AlertDialogTitle>
          <AlertDialogDescription>They stay in the trash for 30 days.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
});

export const Phone = meta.story({ args: { defaultOpen: true }, globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ args: { defaultOpen: true }, globals: { theme: "dark" } });
