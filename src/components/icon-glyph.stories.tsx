import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { IconGlyph, svgDataUri } from "@/components/icon-glyph";

const meta = preview.meta({
  title: "App/Patterns/Icon glyph",
  component: IconGlyph,
  args: { src: "/logos/agents/claude.svg", mono: false, label: "Claude", className: "size-10" },
});

/** One with colors of its own shows as it is. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("img", { name: "Claude" })).toBeInTheDocument();
  },
});

const ARROW = svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12h13l-5-5 1.4-1.4L21 13l-7.6 7.4L12 19l5-5H4z"/></svg>');

/** Drawn in one ink (`mono`): a mask over the text color, so it reads in both themes and takes its parent's color. */
export const Mono = meta.story({
  render: () => (
    <div className="flex items-center gap-4">
      <IconGlyph src={ARROW} mono label="Next" className="size-8" />
      <span className="text-primary-ink">
        <IconGlyph src={ARROW} mono label="Next, in the accent" className="size-8" />
      </span>
      <span className="text-muted-foreground">
        <IconGlyph src={ARROW} mono className="size-5" />
      </span>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("img")).toHaveLength(2);
  },
});

/** Without a label it is decoration, hidden from a screen reader. */
export const Decorative = meta.story({
  args: { label: undefined },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("img")).toHaveAttribute("alt", "");
  },
});

/** The icon library's sizes, as the grid and a row draw them. */
export const Sizes = meta.story({
  render: () => (
    <div className="flex items-end gap-4">
      {["size-5", "size-14", "size-20"].map((c) => (
        <IconGlyph key={c} src="/logos/agents/figma.svg" label="Figma" className={c} />
      ))}
    </div>
  ),
});
