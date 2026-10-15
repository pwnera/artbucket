import preview from "#.storybook/preview";
import { useState } from "react";
import { expect, fn, screen, waitFor } from "storybook/test";
import { IconActivity, IconBook, IconFolderPlus, IconInbox, IconPhoto, IconPlus, IconUpload } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";

/**
 * A list to search and act on from the keyboard: the command palette (Jump to), a picker with many options.
 * Typing filters, arrows move, Enter runs. The Combobox pattern is this inside a Popover.
 */
const meta = preview.meta({
  title: "App/Primitives/Command",
  component: Command,
  args: { loop: true, className: "max-w-md rounded-lg border", label: "Jump to" },
});

const onUpload = fn();

const items = (
  <>
    <CommandEmpty>No match.</CommandEmpty>
    <CommandGroup heading="Actions">
      <CommandItem value="Upload files add" onSelect={onUpload}>
        <IconUpload /> Upload files
        <CommandShortcut className="tracking-normal">
          <Kbd keys={["U"]} />
        </CommandShortcut>
      </CommandItem>
      <CommandItem value="New collection create">
        <IconFolderPlus /> New collection
      </CommandItem>
      <CommandItem value="New brand create">
        <IconPlus /> New brand
      </CommandItem>
    </CommandGroup>
    <CommandSeparator />
    <CommandGroup heading="Go to">
      <CommandItem value="Assets library all files images">
        <IconPhoto /> Assets
      </CommandItem>
      <CommandItem value="Guidelines brand rules">
        <IconBook /> Guidelines
      </CommandItem>
      <CommandItem value="Review suggested approve">
        <IconInbox /> Review
      </CommandItem>
      <CommandItem value="Activity history" disabled>
        <IconActivity /> Activity (admins)
      </CommandItem>
    </CommandGroup>
  </>
);

export const Playground = meta.story({
  beforeEach: () => void onUpload.mockClear(),
  render: (args) => (
    <Command {...args}>
      <CommandInput placeholder="Search assets, pages, rules, collections, or type a command" />
      <CommandList>{items}</CommandList>
    </Command>
  ),
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole("combobox");
    await userEvent.click(input);
    // The first item is picked; arrows move, and loop from the last back to the first.
    await expect(canvas.getByRole("option", { name: /Upload files/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}");
    await expect(canvas.getByRole("option", { name: "New collection" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    await expect(canvas.getByRole("option", { name: "Review" })).toHaveAttribute("aria-selected", "true");
    // Typing filters, by the words in an item's value too ("approve" finds Review).
    await userEvent.type(input, "coll");
    await waitFor(() => expect(canvas.getAllByRole("option")).toHaveLength(1));
    await expect(canvas.getByRole("option", { name: "New collection" })).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "approve");
    await waitFor(() => expect(canvas.getAllByRole("option").map((o) => o.textContent?.trim())).toEqual(["Review"]));
    await userEvent.clear(input);
    await userEvent.type(input, "zzz");
    await expect(await canvas.findByText("No match.")).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "upload{Enter}");
    await expect(onUpload).toHaveBeenCalledOnce();
  },
});

/** The palette: a dialog pinned near the top, with no X (Escape closes it). */
export const Palette = meta.story({
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Jump to <Kbd keys={["mod", "K"]} />
        </Button>
        <CommandDialog open={open} onOpenChange={setOpen} title="Jump to" description="Find assets, brand pages and rules, collections, saved searches and settings, or go anywhere." loop>
          <CommandInput placeholder="Search assets, pages, rules, collections, or type a command" />
          <CommandList>{items}</CommandList>
        </CommandDialog>
      </>
    );
  },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: /Jump to/ });
    await userEvent.click(trigger);
    await screen.findByRole("dialog", { name: "Jump to" });
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveFocus());
    await userEvent.keyboard("guide");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
  },
});

export const Phone = Playground.extend({ globals: { viewport: { value: "phone" } }, play: undefined });

export const Dark = Playground.extend({ globals: { theme: "dark" }, play: undefined });
