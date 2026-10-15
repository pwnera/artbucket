import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { Progress } from "@/components/ui/progress";

/** How far along something is that has a known end: an upload, an import, storage used. Name it (`aria-label`). */
const meta = preview.meta({
  title: "App/Primitives/Progress",
  component: Progress,
  args: { value: 62, "aria-label": "Uploading", className: "max-w-sm" },
  argTypes: { value: { control: { type: "range", min: 0, max: 100 } } },
});

export const Playground = meta.story({
  play: async ({ canvas }) => {
    const bar = canvas.getByRole("progressbar", { name: "Uploading" });
    await expect(bar).toHaveAttribute("aria-valuenow", "62");
    await expect(bar).toHaveAttribute("aria-valuemax", "100");
  },
});

export const Empty = meta.story({ args: { value: 0 } });

export const Done = meta.story({ args: { value: 100, "aria-label": "Uploaded" } });

/** Without a value it has no end yet: Radix marks it indeterminate. */
export const Indeterminate = meta.story({
  args: { value: null, "aria-label": "Preparing" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("progressbar")).toHaveAttribute("data-state", "indeterminate");
  },
});

export const Dark = Playground.extend({ globals: { theme: "dark" } });
