import preview from "#.storybook/preview";
import { useState } from "react";
import { expect, waitFor } from "storybook/test";
import * as icons from "@/components/icons";
import { Input } from "@/components/ui/input";

/** Every icon components/icons exports, by the name the app imports it by. */
const ALL = Object.entries(icons)
  .filter(([name]) => name.startsWith("Icon"))
  .sort(([a], [b]) => a.localeCompare(b)) as [string, icons.Icon][];

function IconGallery() {
  const [q, setQ] = useState("");
  const shown = ALL.filter(([name]) => name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="grid gap-4">
      <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${ALL.length} icons`} aria-label="Search icons" className="max-w-sm" />
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
        {shown.map(([name, I]) => (
          <li key={name} className="flex flex-col items-center gap-2 rounded-lg border p-3 text-center">
            <I aria-hidden className="size-6" />
            <code className="text-muted-foreground w-full truncate font-mono text-xs" title={name}>
              {name.slice(4)}
            </code>
          </li>
        ))}
      </ul>
      {!shown.length && <p className="text-muted-foreground text-sm">No icon is called that.</p>}
    </div>
  );
}

/**
 * The app's icons: Phosphor's, under the names the app has always used (IconSearch, IconLock), in its regular
 * weight, and Tabler's where Phosphor has nothing near. Import them from `@/components/icons`, never from the sets.
 */
const meta = preview.meta({ title: "Foundations/Icons", component: IconGallery });

export const Gallery = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search icons" }), "trash");
    await waitFor(() => expect(canvas.getAllByRole("listitem").length).toBeLessThan(5));
    await expect(canvas.getByText("Trash")).toBeInTheDocument();
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search icons" }), "zzz");
    await expect(canvas.getByText("No icon is called that.")).toBeInTheDocument();
  },
});

/** Sized by font size or a size- class, colored by the text around them. */
export const SizesAndColors = meta.story({
  render: () => (
    <div className="flex items-end gap-4">
      <icons.IconPalette className="size-4" />
      <icons.IconPalette className="size-6" />
      <icons.IconPalette className="size-8 text-primary-ink" />
      <icons.IconPalette className="text-muted-foreground size-10" />
      <icons.IconPinFilled className="text-primary-ink size-8" />
    </div>
  ),
});
