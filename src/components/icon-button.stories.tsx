import preview from "#.storybook/preview";
import { expect, fn, screen, waitFor } from "storybook/test";
import { IconButton } from "@/components/icon-button";
import { IconCopy, IconDots, IconPencil, IconShare, IconTrash } from "@/components/icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const meta = preview.meta({
  title: "App/Patterns/Icon button",
  component: IconButton,
  args: { label: "Share", variant: "outline" as const, size: "icon-sm" as const, onClick: fn(), children: <IconShare /> },
  argTypes: {
    variant: { control: "select", options: ["default", "secondary", "outline", "ghost", "destructive"] },
    size: { control: "select", options: ["icon-xs", "icon-sm", "icon", "icon-lg"] },
    side: { control: "select", options: ["top", "bottom", "left", "right"] },
    children: { control: false },
  },
});

/** Its label is its name and its tooltip. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole("button", { name: "Share" });
    await userEvent.hover(button);
    await expect(await screen.findByRole("tooltip")).toHaveTextContent("Share");
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
});

/** Its key in the tooltip, after the label. */
export const WithShortcut = meta.story({
  args: { label: "Edit", shortcut: ["mod", "E"], children: <IconPencil /> },
  play: async ({ canvas, userEvent }) => {
    await userEvent.hover(canvas.getByRole("button", { name: "Edit" }));
    await expect(await screen.findByRole("tooltip")).toHaveTextContent(/Edit/);
  },
});

export const Variants = meta.story({
  render: () => (
    <div className="flex items-center gap-2">
      <IconButton label="Copy" variant="ghost">
        <IconCopy />
      </IconButton>
      <IconButton label="Share">
        <IconShare />
      </IconButton>
      <IconButton label="Edit" variant="secondary">
        <IconPencil />
      </IconButton>
      <IconButton label="Delete" variant="destructive">
        <IconTrash />
      </IconButton>
      <IconButton label="Share" disabled>
        <IconShare />
      </IconButton>
    </div>
  ),
});

/**
 * A menu's trigger: the menu hands focus back to it on close, and that focus (neither keyboard nor hover) doesn't
 * pop the tooltip. Synthetic clicks can't tell Chromium's focus-visible from a keyboard's, so the play checks the
 * focus coming back; the tooltip staying shut is for a person's mouse.
 */
export const MenuTrigger = meta.story({
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="More">
          <IconDots />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Rename</DropdownMenuItem>
        <DropdownMenuItem>Duplicate</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "More" })).toHaveFocus());
    await expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  },
});
