import preview from "#.storybook/preview";
import type { ComponentProps, ComponentType } from "react";
import { expect, fn } from "storybook/test";
import { IconBold, IconItalic, IconLayoutGrid, IconList } from "@/components/icons";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Group = ComponentProps<typeof ToggleGroup>;
/** Its props are a union (single or multiple), which story args can't infer through: one shape for the controls. */
type Props = Partial<Omit<Group, "type" | "value" | "defaultValue" | "onValueChange">> & {
  type?: "single" | "multiple";
  defaultValue?: string | string[];
  onValueChange?: (value: string | string[]) => void;
};

/** A few toggles that belong together: one of them (a view) or any of them (formats). Arrows move between them. */
const meta = preview.meta({
  title: "App/Primitives/Toggle group",
  component: ToggleGroup as ComponentType<Props>,
  args: { type: "single", defaultValue: "grid", variant: "outline", size: "default", spacing: 0, disabled: false, "aria-label": "View", onValueChange: fn() },
  argTypes: {
    type: { control: "inline-radio", options: ["single", "multiple"] },
    variant: { control: "inline-radio", options: ["default", "outline"] },
    size: { control: "inline-radio", options: ["sm", "default", "lg"] },
    spacing: { control: { type: "number", min: 0, max: 4 } },
  },
  render: (args) => (
    <ToggleGroup {...(args as Group)}>
      <ToggleGroupItem value="grid" aria-label="Grid">
        <IconLayoutGrid />
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label="List">
        <IconList />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
});

export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    // One of them: a radio group, so a click on List turns Grid off.
    await userEvent.click(canvas.getByRole("radio", { name: "List" }));
    await expect(canvas.getByRole("radio", { name: "List" })).toBeChecked();
    await expect(canvas.getByRole("radio", { name: "Grid" })).not.toBeChecked();
    await expect(args.onValueChange).toHaveBeenLastCalledWith("list");
  },
});

/** Tab reaches the group once; arrows move, Space or Enter picks. */
export const Keyboard = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.tab();
    await expect(canvas.getByRole("radio", { name: "Grid" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("radio", { name: "List" })).toHaveFocus();
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await userEvent.keyboard(" ");
    await expect(args.onValueChange).toHaveBeenLastCalledWith("list");
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("radio", { name: "Grid" })).toHaveFocus();
  },
});

/** Any of them: each is its own pressed button. */
export const Multiple = meta.story({
  args: { type: "multiple", defaultValue: ["bold"], variant: "default", "aria-label": "Format" },
  render: (args) => (
    <ToggleGroup {...(args as Group)}>
      <ToggleGroupItem value="bold" aria-label="Bold">
        <IconBold />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Italic">
        <IconItalic />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Italic" }));
    await expect(args.onValueChange).toHaveBeenLastCalledWith(["bold", "italic"]);
  },
});

/** With words, spaced apart. */
export const Spaced = meta.story({
  args: { spacing: 1, variant: "default", defaultValue: "all", "aria-label": "Status" },
  render: (args) => (
    <ToggleGroup {...(args as Group)}>
      <ToggleGroupItem value="all">All</ToggleGroupItem>
      <ToggleGroupItem value="approved">Approved</ToggleGroupItem>
      <ToggleGroupItem value="waiting">Waiting for review</ToggleGroupItem>
    </ToggleGroup>
  ),
});

export const Disabled = meta.story({ args: { disabled: true } });

/** The grouped story's pair: a view switch beside a single toggle. */
export const Toggles = meta.story({
  render: () => (
    <div className="flex items-center gap-4">
      <ToggleGroup type="single" defaultValue="grid" variant="outline" aria-label="View">
        <ToggleGroupItem value="grid" aria-label="Grid">
          <IconLayoutGrid />
        </ToggleGroupItem>
        <ToggleGroupItem value="list" aria-label="List">
          <IconList />
        </ToggleGroupItem>
      </ToggleGroup>
      <Toggle aria-label="Only approved" defaultPressed>
        Only approved
      </Toggle>
    </div>
  ),
});

export const Dark = Spaced.extend({ globals: { theme: "dark" } });
