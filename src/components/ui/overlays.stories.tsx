import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { toast } from "sonner";
import { IconDots } from "@/components/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** What opens over a page: dialogs, menus, popovers, sheets, tooltips and toasts. */
const meta = { title: "App/Overlays" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const DialogStory: Story = {
  name: "Dialog",
  render: () => (
    <Dialog>
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
};

export const Confirm: Story = {
  render: () => (
    <AlertDialog>
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
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
};

export const Menu: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="More">
          <IconDots />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>logo-primary.svg</DropdownMenuLabel>
        <DropdownMenuItem>
          Download <DropdownMenuShortcut>D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>Copy link</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Archive</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const PopoverStory: Story = {
  name: "Popover",
  render: () => (
    <Popover>
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
};

export const SheetStory: Story = {
  name: "Sheet",
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Details</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>logo-primary.svg</SheetTitle>
          <SheetDescription>Version 4, approved, cleared for web and print.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
};

export const TooltipStory: Story = {
  name: "Tooltip",
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>Released Monday at 08:00</TooltipContent>
    </Tooltip>
  ),
};

export const Toast: Story = {
  render: () => (
    <div className="flex gap-2">
      <Button onClick={() => toast.success("Released: everyone sees version 36 now")}>Success</Button>
      <Button variant="outline" onClick={() => toast.error("That logo was replaced: use version 4")}>
        Error
      </Button>
    </div>
  ),
};
