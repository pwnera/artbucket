import preview from "#.storybook/preview";
import { expect, fn, screen, waitFor } from "storybook/test";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Closed again before axe runs: while open, Radix hides the page around the list (aria-hidden), trigger included. */
const close = async (userEvent: { keyboard: (k: string) => Promise<void> }) => {
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
};

/** One of a short, fixed list, where the options need no search. A long list or one to search is a Combobox. */
const meta = preview.meta({
  title: "App/Primitives/Select",
  component: Select,
  args: { defaultValue: "public", disabled: false, onValueChange: fn() },
  render: (args) => (
    <div className="grid max-w-xs gap-2">
      <Label htmlFor="access">Who gets in</Label>
      <Select {...args}>
        <SelectTrigger id="access" className="w-full" aria-invalid={args.name === "invalid" || undefined}>
          <SelectValue placeholder="Choose who gets in" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="public">Anyone with the address</SelectItem>
          <SelectItem value="password">Whoever has the password</SelectItem>
          <SelectItem value="members">People in the project</SelectItem>
          <SelectItem value="sso" disabled>
            Your company&apos;s sign-in (Business)
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
});

export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole("combobox", { name: "Who gets in" });
    await expect(trigger).toHaveTextContent("Anyone with the address");
    // From the keyboard: Enter opens it on the chosen option, arrows move, Enter picks and closes.
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const list = await screen.findByRole("listbox");
    await waitFor(() => expect(screen.getByRole("option", { name: "Anyone with the address" })).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await expect(screen.getByRole("option", { name: "People in the project" })).toHaveFocus();
    // The disabled option is skipped.
    await userEvent.keyboard("{ArrowDown}");
    await expect(screen.getByRole("option", { name: "People in the project" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onValueChange).toHaveBeenCalledWith("members");
    await waitFor(() => expect(list).not.toBeInTheDocument());
    await expect(trigger).toHaveTextContent("People in the project");
    await waitFor(() => expect(trigger).toHaveFocus());
  },
});

/** Escape closes it with nothing changed. */
export const EscapeKeeps = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole("combobox", { name: "Who gets in" });
    await userEvent.click(trigger);
    await screen.findByRole("listbox");
    await userEvent.keyboard("{ArrowDown}{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await expect(trigger).toHaveTextContent("Anyone with the address");
  },
});

export const Placeholder = meta.story({ args: { defaultValue: undefined } });

export const Disabled = meta.story({ args: { disabled: true } });

/** `name: "invalid"` here only marks the trigger `aria-invalid`, as a form does after a failed save. */
export const Invalid = meta.story({ args: { defaultValue: undefined, name: "invalid" } });

/** The small trigger, for a toolbar or a table row; it needs a name of its own (`aria-label`) there. */
export const Small = meta.story({
  render: (args) => (
    <Select {...args} defaultValue="editor">
      <SelectTrigger size="sm" className="w-32" aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="viewer">Viewer</SelectItem>
        <SelectItem value="editor">Editor</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
      </SelectContent>
    </Select>
  ),
});

export const Groups = meta.story({
  render: (args) => (
    <Select {...args} defaultValue="web">
      <SelectTrigger className="w-56" aria-label="Context">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Digital</SelectLabel>
          <SelectItem value="web">Web</SelectItem>
          <SelectItem value="social">Social</SelectItem>
          <SelectItem value="email">Email</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Physical</SelectLabel>
          <SelectItem value="print">Print</SelectItem>
          <SelectItem value="signage">Signage</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Context" }));
    await expect(await screen.findByRole("group", { name: "Physical" })).toBeInTheDocument();
    await close(userEvent);
  },
});

export const LongText = meta.story({ args: { defaultValue: "members" }, globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({
  globals: { theme: "dark" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Who gets in" }));
    await screen.findByRole("listbox");
    await close(userEvent);
  },
});
