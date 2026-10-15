import preview from "#.storybook/preview";
import { useState } from "react";
import { expect, fn, screen, waitFor } from "storybook/test";
import { IconArchive, IconDownload, IconLink } from "@/components/icons";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

/**
 * A right click (or a long press) opens what the thing's "..." menu holds: a shortcut, never the only way. Keep the
 * same items, in the same order, in a Dropdown menu on the thing itself.
 */
const meta = preview.meta({
  title: "App/Primitives/Context menu",
  component: ContextMenu,
  args: { modal: true, onOpenChange: fn() },
});

const onDownload = fn();
const closed = () => waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

export const Playground = meta.story({
  beforeEach: () => void onDownload.mockClear(),
  render: (args) => (
    <ContextMenu {...args}>
      <ContextMenuTrigger className="text-muted-foreground grid h-40 max-w-sm place-items-center rounded-lg border border-dashed text-sm">
        Right click the asset
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>logo-primary.svg</ContextMenuLabel>
        <ContextMenuItem onSelect={onDownload}>
          <IconDownload /> Download <ContextMenuShortcut>D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>
          <IconLink /> Copy link
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Add to</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem>Spring campaign</ContextMenuItem>
            <ContextMenuItem>Northwind launch</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive">
          <IconArchive /> Archive
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.pointer({ keys: "[MouseRight]", target: canvas.getByText("Right click the asset") });
    await screen.findByRole("menu");
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true);
    await userEvent.keyboard("{ArrowDown}");
    await expect(screen.getByRole("menuitem", { name: /Download/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowRight}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Spring campaign" })).toHaveFocus());
    await userEvent.keyboard("{ArrowLeft}{ArrowUp}{ArrowUp}{Enter}");
    await expect(onDownload).toHaveBeenCalledOnce();
    await closed();
    // Escape closes it with nothing run.
    await userEvent.pointer({ keys: "[MouseRight]", target: canvas.getByText("Right click the asset") });
    await screen.findByRole("menu");
    await userEvent.keyboard("{Escape}");
    await closed();
    await expect(onDownload).toHaveBeenCalledOnce();
  },
});

export const Radio = meta.story({
  render: function Render(args) {
    const [size, setSize] = useState("medium");
    return (
      <ContextMenu {...args}>
        <ContextMenuTrigger className="text-muted-foreground grid h-40 max-w-sm place-items-center rounded-lg border border-dashed text-sm">
          Tile size: {size}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuRadioGroup value={size} onValueChange={setSize}>
            <ContextMenuRadioItem value="small">Small</ContextMenuRadioItem>
            <ContextMenuRadioItem value="medium">Medium</ContextMenuRadioItem>
            <ContextMenuRadioItem value="large">Large</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuContent>
      </ContextMenu>
    );
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.pointer({ keys: "[MouseRight]", target: canvas.getByText(/Tile size/) });
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Large" }));
    await closed();
    await expect(canvas.getByText("Tile size: large")).toBeInTheDocument();
  },
});

export const Dark = meta.story({
  globals: { theme: "dark" },
  render: Playground.input.render,
  play: async ({ canvas, userEvent }) => {
    await userEvent.pointer({ keys: "[MouseRight]", target: canvas.getByText("Right click the asset") });
    await screen.findByRole("menu");
    await userEvent.keyboard("{Escape}");
    await closed();
  },
});
