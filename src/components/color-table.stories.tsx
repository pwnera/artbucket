import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { colorRows } from "#.storybook/fixtures/patterns";
import { ColorCells, ColorHead } from "@/components/color-table";

const meta = preview.meta({
  title: "App/Patterns/Color table",
  component: ColorCells,
  args: { row: colorRows[2], label: "Primary", dark: true },
  argTypes: { row: { control: "select", options: colorRows.map((r) => r.key), mapping: Object.fromEntries(colorRows.map((r) => [r.key, r])) } },
});

/** One row: the token's name, its light value and its dark one, each with its contrast as text. */
export const Playground = meta.story({});

const Table = ({ dark }: { dark: boolean }) => (
  <div className="grid max-w-3xl gap-2">
    <ColorHead dark={dark} />
    {colorRows.map((r) => (
      <ColorCells key={r.key} row={r} dark={dark} label={r.key === "color.violet" ? "Primary" : null} />
    ))}
  </div>
);

/** A brand with dark values: Light and Dark side by side, every grade from AAA to a fail. */
export const WithDark = meta.story({
  render: () => <Table dark />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("night-muted")).toBeInTheDocument();
    await expect(canvas.getByText("Inherits Light")).toBeInTheDocument();
    await expect(canvas.getAllByText(", fails as text")).toHaveLength(1);
  },
});

/** Before any dark value: one Value column. */
export const LightOnly = meta.story({ render: () => <Table dark={false} /> });

/** On a phone the name sits over the two values. */
export const Phone = meta.story({ render: () => <Table dark />, globals: { viewport: { value: "phone" } } });
