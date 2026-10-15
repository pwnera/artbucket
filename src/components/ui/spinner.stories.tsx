import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { Spinner } from "@/components/ui/spinner";

/** Something is working. Hidden from screen readers unless named (`aria-label`): say it in text beside it, or name it. */
const meta = preview.meta({
  title: "App/Primitives/Spinner",
  component: Spinner,
  args: { className: "" },
});

export const Playground = meta.story({
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-slot=spinner]")).toHaveAttribute("aria-hidden", "true");
  },
});

/** With its words beside it: the text is what a screen reader reads. */
export const WithText = meta.story({
  render: () => (
    <div className="flex items-center gap-2 text-sm">
      <Spinner /> Rendering the preview
    </div>
  ),
});

/** Alone, it needs a name: then it is an image with that name. */
export const Named = meta.story({
  args: { "aria-label": "Loading assets" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("img", { name: "Loading assets" })).toBeVisible();
  },
});

export const Sizes = meta.story({
  render: () => (
    <div className="text-primary-ink flex items-center gap-4">
      <Spinner className="size-3" />
      <Spinner />
      <Spinner className="size-6" />
      <Spinner className="size-8" />
    </div>
  ),
});
