import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { IconLayoutGrid, IconList } from "@/components/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Picking one of a few: tabs, toggles. */
const meta = { title: "App/Choices" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const TabsStory: Story = {
  name: "Tabs",
  render: () => (
    <Tabs defaultValue="rules" className="max-w-md">
      <TabsList>
        <TabsTrigger value="rules">Rules</TabsTrigger>
        <TabsTrigger value="pages">Pages</TabsTrigger>
        <TabsTrigger value="releases">Releases</TabsTrigger>
      </TabsList>
      <TabsContent value="rules" className="text-muted-foreground text-sm">
        Colors, type, logos and voice, as data.
      </TabsContent>
      <TabsContent value="pages" className="text-muted-foreground text-sm">
        The guideline pages readers see.
      </TabsContent>
      <TabsContent value="releases" className="text-muted-foreground text-sm">
        Every release, and what it changed.
      </TabsContent>
    </Tabs>
  ),
};

export const Toggles: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <ToggleGroup type="single" defaultValue="grid" variant="outline" aria-label="View">
        <ToggleGroupItem value="grid" aria-label="Grid">
          <IconLayoutGrid />
        </ToggleGroupItem>
        <ToggleGroupItem value="list" aria-label="List">
          <IconList />
        </ToggleGroupItem>
      </ToggleGroup>
      <Toggle aria-label="Only approved" defaultPressed>
        Only approved
      </Toggle>
    </div>
  ),
};
