import preview from "#.storybook/preview";
import { useState } from "react";
import { expect, fn, screen, waitFor } from "storybook/test";
import { IconArchive, IconDots, IconDownload, IconLink } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The actions of one thing, behind a "...": download, copy a link, archive. Picking one runs it and closes the menu. */
const meta = preview.meta({
  title: "App/Primitives/Dropdown menu",
  component: DropdownMenu,
  args: { modal: true, onOpenChange: fn() },
});

const onDownload = fn();
const onArchive = fn();

const closed = () => waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

/** The grouped story's menu. */
export const Menu = meta.story({
  beforeEach: () => {
    onDownload.mockClear();
    onArchive.mockClear();
  },
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="More">
          <IconDots />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>logo-primary.svg</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onDownload}>
            <IconDownload /> Download <DropdownMenuShortcut>D</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <IconLink /> Copy link
          </DropdownMenuItem>
          <DropdownMenuItem disabled>Replace (an editor can)</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onArchive}>
          <IconArchive /> Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "More" });
    // From the keyboard: Enter opens it on the first item; arrows move, skip the disabled one, and stop at the ends.
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menu");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: /Download/ })).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    await expect(screen.getByRole("menuitem", { name: /Download/ })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(onDownload).toHaveBeenCalledOnce();
    await closed();
    await expect(trigger).toHaveFocus();
    // Escape closes with nothing run.
    await userEvent.click(trigger);
    await screen.findByRole("menu");
    await userEvent.keyboard("{Escape}");
    await closed();
    await expect(onArchive).not.toHaveBeenCalled();
    await expect(trigger).toHaveFocus();
  },
});

/** Settings kept in the menu: checkboxes for any, radios for one. Picking one keeps the menu open (`preventDefault`). */
export const Choices = meta.story({
  render: function Render(args) {
    const [approved, setApproved] = useState(true);
    const [sort, setSort] = useState("newest");
    return (
      <DropdownMenu {...args}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">View</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-52">
          <DropdownMenuCheckboxItem checked={approved} onCheckedChange={setApproved} onSelect={(e) => e.preventDefault()}>
            Only approved
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
            <DropdownMenuRadioItem value="newest">Newest</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="size">Size</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "View" }));
    const only = await screen.findByRole("menuitemcheckbox", { name: "Only approved" });
    await expect(only).toBeChecked();
    await userEvent.click(only);
    await expect(only).not.toBeChecked();
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Name" }));
    await closed();
    await userEvent.click(canvas.getByRole("button", { name: "View" }));
    await expect(await screen.findByRole("menuitemradio", { name: "Name" })).toBeChecked();
    await userEvent.keyboard("{Escape}");
    await closed();
  },
});

/** A submenu: ArrowRight opens it, ArrowLeft goes back. */
export const Submenu = meta.story({
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Add to</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>New collection</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Recent collections</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Spring campaign</DropdownMenuItem>
            <DropdownMenuItem>Northwind launch</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvas, userEvent }) => {
    canvas.getByRole("button", { name: "Add to" }).focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menu");
    await userEvent.keyboard("{ArrowDown}");
    await expect(screen.getByRole("menuitem", { name: "Recent collections" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Spring campaign" })).toHaveFocus());
    await userEvent.keyboard("{ArrowLeft}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Recent collections" })).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await closed();
  },
});

export const Dark = meta.story({
  globals: { theme: "dark" },
  render: Menu.input.render,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More" }));
    await screen.findByRole("menu");
    await userEvent.keyboard("{Escape}");
    await closed();
  },
});
