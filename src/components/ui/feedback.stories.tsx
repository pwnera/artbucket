import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { IconPhoto } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/** How the app says what is happening: progress, loading, empty states, keys. */
const meta = { title: "App/Feedback" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  render: () => (
    <div className="grid max-w-sm gap-4">
      <Progress value={62} aria-label="Uploading" />
      <div className="flex items-center gap-2 text-sm">
        <Spinner /> Rendering the preview
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="aspect-square" />
        ))}
      </div>
    </div>
  ),
};

export const EmptyState: Story = {
  render: () => (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconPhoto />
        </EmptyMedia>
        <EmptyTitle>No assets yet</EmptyTitle>
        <EmptyDescription>Drop files here, or connect a drive to bring them in.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>Upload</Button>
      </EmptyContent>
    </Empty>
  ),
};

export const Keys: Story = {
  render: () => (
    <div className="flex items-center gap-3 text-sm">
      <span>
        Search <Kbd keys={["mod", "K"]} />
      </span>
      <Separator orientation="vertical" className="h-4" />
      <span>
        Upload <Kbd keys={["U"]} />
      </span>
    </div>
  ),
};
