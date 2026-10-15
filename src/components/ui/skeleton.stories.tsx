import preview from "#.storybook/preview";
import { Skeleton } from "@/components/ui/skeleton";

/** Where content will be, while it loads: shaped like it, so nothing jumps when it arrives. */
const meta = preview.meta({
  title: "App/Primitives/Skeleton",
  component: Skeleton,
  args: { className: "h-4 w-48" },
});

export const Playground = meta.story({});

/** A grid of asset tiles, as the gallery shows them while the first page loads. */
export const Tiles = meta.story({
  render: () => (
    <div className="grid max-w-sm grid-cols-3 gap-2">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="aspect-square" />
      ))}
    </div>
  ),
});

export const Row = meta.story({
  render: () => (
    <div className="flex max-w-sm items-center gap-3">
      <Skeleton className="size-10 rounded-full" />
      <div className="grid flex-1 gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  ),
});

export const Dark = Tiles.extend({ globals: { theme: "dark" } });
