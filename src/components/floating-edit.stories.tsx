import preview from "#.storybook/preview";
import { expect, fn, spyOn, waitFor } from "storybook/test";
import { FloatingEdit } from "@/components/floating-edit";

const meta = preview.meta({
  title: "App/Patterns/Floating edit",
  component: FloatingEdit,
  args: { href: "/brand/acme/edit", label: "Edit this page", always: true },
  parameters: { layout: "fullscreen" },
});

/** On BrandHub and portals (`always`): there from the start, at the bottom of the window. */
export const Playground = meta.story({
  beforeEach: () => {
    const scroll = spyOn(window, "scrollTo").mockImplementation(() => {});
    return () => scroll.mockRestore();
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("link", { name: "Edit this page" })).toHaveAttribute("href", "/brand/acme/edit");
    await userEvent.click(canvas.getByRole("button", { name: "Back to the top" }));
    await expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  },
});

/** Where the host has a theme to edit: Theme beside Edit. */
export const WithTheme = meta.story({
  args: { onTheme: fn(), label: "Edit this brand" },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Theme" }));
    await expect(args.onTheme).toHaveBeenCalledOnce();
  },
});

/** In the app's reader, whose header has Edit: it comes once the header has scrolled away. */
export const AfterScrolling = meta.story({
  args: { always: false },
  render: (args) => (
    <div className="h-[300vh] p-6">
      <p className="text-sm">The page, long enough to scroll.</p>
      <FloatingEdit {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const bar = canvasElement.querySelector("[data-chrome]")!;
    await expect(bar).toHaveAttribute("inert");
    window.scrollTo({ top: 600 });
    await waitFor(() => expect(bar).not.toHaveAttribute("inert"));
    window.scrollTo({ top: 0 });
    await waitFor(() => expect(bar).toHaveAttribute("inert"));
  },
});
