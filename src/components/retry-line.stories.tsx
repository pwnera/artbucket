import preview from "#.storybook/preview";
import { expect, fn } from "storybook/test";
import { RetryLine } from "@/components/retry-line";

const meta = preview.meta({
  title: "App/Patterns/Retry line",
  component: RetryLine,
  args: { what: "who sees it", retry: fn() },
});

/** A panel whose data didn't load: said in its place, with another try. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Couldn't load who sees it.");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(args.retry).toHaveBeenCalledOnce();
  },
});

/** The asset panel's Used in, as it says it. */
export const WhereItIsUsed = meta.story({ args: { what: "where it is used" } });
