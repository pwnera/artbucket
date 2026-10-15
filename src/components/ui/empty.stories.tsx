import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { IconPhoto, IconSearch } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** Nothing here yet: say why, and offer the next step. `sm` inside a dialog or a list. */
const meta = preview.meta({
  title: "App/Primitives/Empty",
  component: Empty,
  args: { size: "default", className: "border" },
  argTypes: { size: { control: "inline-radio", options: ["default", "sm"] } },
  render: (args) => (
    <Empty {...args}>
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
});

export const EmptyState = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No assets yet")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Upload" })).toBeEnabled();
  },
});

export const Small = meta.story({ args: { size: "sm" } });

/** A search with no results: no action, a link back instead. */
export const NoResults = meta.story({
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconSearch />
        </EmptyMedia>
        <EmptyTitle>No results for &ldquo;northwind logo&rdquo;</EmptyTitle>
        <EmptyDescription>
          Try fewer words, or <a href="#all">see every asset</a>.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  ),
});

export const Phone = EmptyState.extend({ globals: { viewport: { value: "phone" } } });

export const Dark = EmptyState.extend({ globals: { theme: "dark" } });
