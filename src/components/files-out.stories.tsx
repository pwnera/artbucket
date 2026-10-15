import preview from "#.storybook/preview";
import { expect, screen } from "storybook/test";
import { FilesOut } from "@/components/files-out";

const shown = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `ast_${i}`, filename: ["acme-display.woff2", "hero-spring.psd", "brand-film.mp4", "logo-master.ai", "print-kit.indd"][i], font: i === 0 }));

const meta = preview.meta({
  title: "App/Patterns/Files out",
  component: FilesOut,
  args: { name: "Acme", files: { downloadable: 12, shownOnly: shown(1) } },
  decorators: [(Story) => <div className="max-w-lg">{Story()}</div>],
});

/** Some to download, one shown only. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("note")).toHaveTextContent("can download 12 of its files. One is shown only: acme-display.woff2.");
    await userEvent.click(canvas.getByRole("button", { name: "More info" }));
    await expect(await screen.findByRole("tooltip")).toHaveTextContent("Each file's Rights set this");
  },
});

/** Every file downloadable. */
export const AllDownloadable = meta.story({
  args: { files: { downloadable: 8, shownOnly: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("note")).toHaveTextContent("can download all 8 of its files.");
  },
});

/** Just one, and downloadable. */
export const OneFile = meta.story({
  args: { files: { downloadable: 1, shownOnly: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("note")).toHaveTextContent("can download its file.");
  },
});

/** Many shown only: three names, then how many more. */
export const ManyShownOnly = meta.story({
  args: { files: { downloadable: 3, shownOnly: shown(5) } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("note")).toHaveTextContent("5 are shown only: acme-display.woff2, hero-spring.psd, brand-film.mp4 and 2 more.");
  },
});

/** Nothing to download. */
export const NoneDownloadable = meta.story({
  args: { files: { downloadable: 0, shownOnly: shown(2) } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("note")).toHaveTextContent("Nobody outside the project can download Acme's files.");
  },
});

/** A brand without files: nothing said at all. */
export const NoFiles = meta.story({
  args: { files: { downloadable: 0, shownOnly: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("note")).not.toBeInTheDocument();
  },
});
