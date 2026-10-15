import preview from "#.storybook/preview";
import { tagCounts } from "#.storybook/fixtures/patterns";
import { useState } from "react";
import { expect, fn, screen } from "storybook/test";
import { FacetFilter } from "@/components/facet-filter";

const TYPES = [
  { value: "image", count: 1_842 },
  { value: "vector", count: 312 },
  { value: "video", count: 48 },
  { value: "font", count: 9 },
];

const meta = preview.meta({
  title: "App/Patterns/Facet filter",
  component: FacetFilter,
  args: { label: "Type", counts: TYPES, selected: [], mode: "any" as const, creatable: false, onChange: fn(), format: (v: string) => v[0].toUpperCase() + v.slice(1) },
  argTypes: { mode: { control: "inline-radio", options: ["any", "all"] }, format: { control: false } },
  // Controlled, as the library holds it: the story keeps what is selected and reports each change.
  render: function Render(args) {
    const [selected, setSelected] = useState(args.selected);
    return (
      <FacetFilter
        {...args}
        selected={selected}
        onChange={(v) => {
          setSelected(v);
          args.onChange(v);
        }}
      />
    );
  },
});

/** Open it, tick values, see them on the button, clear them. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Type" }));
    await expect(await screen.findByText("Any of")).toBeInTheDocument();
    await expect(screen.getByRole("option", { name: /Image/ })).toHaveTextContent("1,842");
    await userEvent.click(screen.getByRole("option", { name: /Video/ }));
    await expect(args.onChange).toHaveBeenLastCalledWith(["video"]);
    await userEvent.click(screen.getByRole("option", { name: /Font/ }));
    await expect(args.onChange).toHaveBeenLastCalledWith(["video", "font"]);
    await userEvent.click(screen.getByRole("option", { name: /Video/ }));
    await expect(args.onChange).toHaveBeenLastCalledWith(["font"]);
    await userEvent.click(screen.getByRole("option", { name: "Clear filter" }));
    await expect(args.onChange).toHaveBeenLastCalledWith([]);
  },
});

/** Two picked show by name on the button; more say how many. */
export const Selected = meta.story({
  args: { selected: ["image", "vector", "video"] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button")).toHaveTextContent("3 selected");
  },
});

/** A selected value whose count dropped to zero stays listed, so it can be cleared. */
export const SelectedGone = meta.story({
  args: { selected: ["audio"] },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Type/ }));
    await expect(await screen.findByRole("option", { name: /Audio/ })).toHaveTextContent("0");
  },
});

/** Tags: all must match, and anything typed can be filtered by. */
export const Tags = meta.story({
  args: { label: "Tags", counts: tagCounts, mode: "all", creatable: true, format: undefined },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Tags" }));
    await expect(await screen.findByText("Has all of")).toBeInTheDocument();
    await userEvent.keyboard("Autumn");
    await userEvent.click(await screen.findByRole("option", { name: /Filter by tag “Autumn”/ }));
    await expect(args.onChange).toHaveBeenLastCalledWith(["autumn"]);
  },
});

/** The API lists the 50 most used tags: a rarer one is a search away, and it says so. */
export const FiftyTags = meta.story({
  args: { label: "Tags", counts: Array.from({ length: 50 }, (_, i) => ({ value: `tag-${i + 1}`, count: 500 - i })), mode: "all", creatable: true, format: undefined },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Tags" }));
    await expect(await screen.findByText("50 most used. Type to filter by any other.")).toBeInTheDocument();
  },
});

/** No values and nothing to type: nothing drawn. */
export const Empty = meta.story({
  args: { counts: [] },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
  },
});
