import preview from "#.storybook/preview";
import { failing } from "#.storybook/mocks";
import { useState } from "react";
import { expect, fn, screen, waitFor } from "storybook/test";
import { Confirm } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { send } from "@/lib/send";

const meta = preview.meta({
  title: "App/Patterns/Confirm",
  component: Confirm,
  args: {
    title: "Delete Acme logo?",
    says: "It goes to the trash for 30 days, then for good. Pages that show it will show nothing.",
    action: "Delete",
    destructive: true,
    run: fn(async () => ({})),
    children: <Button variant="outline">Delete</Button>,
  },
  argTypes: { children: { control: false }, title: { control: "text" }, says: { control: "text" } },
});

const open = async (userEvent: { click: (el: Element) => Promise<void> }, canvas: { getByRole: typeof screen.getByRole }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
  return screen.findByRole("alertdialog", { name: "Delete Acme logo?" });
};

/** Confirmed: the action runs, and the dialog closes once it worked. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const dialog = await open(userEvent, canvas);
    await expect(dialog).toHaveAccessibleDescription(/goes to the trash/);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await expect(args.run).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  },
});

/** Cancelled: nothing runs. */
export const Cancel = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await open(userEvent, canvas);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await expect(args.run).not.toHaveBeenCalled();
  },
});

/** The request failed (send() resolves null, and toasts why): the dialog stays, for another try. */
export const Refused = meta.story({
  beforeEach: ({ msw }) => void msw.use(failing),
  args: { run: fn(() => send("DELETE", "/api/v1/assets/ast_logo")) },
  play: async ({ args, canvas, userEvent }) => {
    await open(userEvent, canvas);
    const action = screen.getByRole("button", { name: "Delete" });
    await userEvent.click(action);
    await waitFor(() => expect(action).toHaveAttribute("aria-busy", "true"));
    await expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await waitFor(() => expect(action).not.toHaveAttribute("aria-busy"));
    await expect(args.run).toHaveBeenCalledOnce();
    await expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  },
});

/** A run that throws: said in a toast, and the dialog stays. */
export const Throws = meta.story({
  args: { run: fn(async () => Promise.reject(new Error("offline"))) },
  play: async ({ canvas, userEvent }) => {
    await open(userEvent, canvas);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await expect(await screen.findByText("That didn't work. Try again.")).toBeInTheDocument();
    await expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  },
});

/** Not destructive (publish, restore): the primary color, and no description needed. */
export const NotDestructive = meta.story({
  args: { title: "Publish Acme to its portal?", says: undefined, action: "Publish", destructive: false, children: <Button>Publish</Button> },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Publish" }));
    await expect(await screen.findByRole("alertdialog", { name: "Publish Acme to its portal?" })).toBeInTheDocument();
  },
});

/** Controlled (`open`), from a menu item that can't be its trigger. */
export const Controlled = meta.story({
  render: function Render(args) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Remove from collection
        </Button>
        <Confirm title="Remove from Spring campaign?" action="Remove" run={args.run} open={open} onOpenChange={setOpen} />
      </>
    );
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove from collection" }));
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await expect(args.run).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  },
});
