import preview from "#.storybook/preview";
import { expect, fn } from "storybook/test";
import { RenditionMenu } from "@/components/rendition-menu";

/**
 * Which rendition of an asset a rule means (RenditionMenu): the original, a standard size, or any spec /a/{id}/{spec}
 * takes. A command list, so arrows and typing pick one; a custom spec is checked before it is used.
 */
const meta = preview.meta({
  title: "App/Features/Library/Rendition menu",
  component: RenditionMenu,
  args: { value: null, onChange: fn() },
  decorators: [(Story) => <div className="bg-popover w-72 rounded-md border">{Story()}</div>],
});

/** Pick a preset with the arrows and Enter. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByPlaceholderText("Rendition"));
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    await expect(args.onChange).toHaveBeenCalledWith("w_1200,f_webp");
  },
});

/** A custom spec: refused when it isn't one, normalized when it is. */
export const Custom = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const input = canvas.getByRole("textbox", { name: "Custom size" });
    await userEvent.type(input, "big{Enter}");
    await expect(canvas.getByRole("alert")).toHaveTextContent("Not a size. Try w_512,f_png");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await userEvent.clear(input);
    await userEvent.type(input, "f_png,w_512");
    await userEvent.click(canvas.getByRole("button", { name: "Use" }));
    await expect(args.onChange).toHaveBeenCalledWith(expect.stringContaining("w_512"));
  },
});

/** A custom spec already chosen: it sits in the field, ringed. */
export const CustomValue = meta.story({ args: { value: "w_640,h_640,f_png" } });

/** A preset chosen: its check. */
export const Chosen = meta.story({ args: { value: "f_png" } });
