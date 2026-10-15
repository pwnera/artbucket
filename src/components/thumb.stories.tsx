import preview from "#.storybook/preview";
import { delay, http } from "msw";
import { expect, waitFor } from "storybook/test";
import { FileThumb, Thumb } from "@/components/thumb";

const meta = preview.meta({
  title: "App/Patterns/Thumb",
  component: Thumb,
  args: { src: "/logos/agents/figma.svg", alt: "Figma logo", eager: false },
  // Its parent must be `relative`: a tile.
  decorators: [(Story) => <div className="bg-muted/40 relative size-40 overflow-hidden rounded-lg border">{Story()}</div>],
});

/** Arrived: faded in, contained in its tile. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    const img = canvas.getByRole("img", { name: "Figma logo" });
    await waitFor(() => expect(img).toHaveClass("opacity-100"));
  },
});

/** A rendition: a 2x screen gets one twice as wide. */
export const Rendition = meta.story({
  args: { src: "/a/ast_logo/w_240,f_webp", alt: "Acme logo" },
  beforeEach: ({ msw }) => void msw.use(http.get("/a/*", () => delay("infinite"))),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("img", { name: "Acme logo" })).toHaveAttribute("srcset", "/a/ast_logo/w_240,f_webp 1x, /a/ast_logo/w_480,f_webp 2x");
  },
});

/** On the way: a soft pulse after the first beat. */
export const Loading = meta.story({
  args: { src: "/a/ast_logo/w_240,f_webp", alt: "Acme logo" },
  beforeEach: ({ msw }) => void msw.use(http.get("/a/*", () => delay("infinite"))),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-slot=skeleton]")).toBeTruthy();
  },
});

/** On the way, over a small rendition already cached (the tile's), blurred. */
export const WithPlaceholder = meta.story({
  args: { src: "/a/ast_logo/w_1600,f_webp", alt: "Acme logo", placeholder: "/logos/agents/figma.svg" },
  beforeEach: ({ msw }) => void msw.use(http.get("/a/*", () => delay("infinite"))),
});

/** What can't render, or a passing 5xx: the no-preview well, not a broken image. */
export const Failed = meta.story({
  args: { src: "/a/ast_broken/w_240,f_webp", alt: "Acme brand film" },
  beforeEach: ({ msw }) => void msw.use(http.get("/a/*", () => new Response(null, { status: 502 }))),
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole("img", { name: "Acme brand film" }).tagName).toBe("SPAN"));
  },
});

/** A rule's font file: its letters, since a font has no picture to scale. */
export const FontFile = meta.story({
  render: () => <FileThumb file={{ mime: "font/woff2", filename: "acme-display.woff2" }} src="/a/ast_font/w_128,f_webp" alt="Acme Display" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("img", { name: "Acme Display" })).toHaveTextContent("Aa");
  },
});
