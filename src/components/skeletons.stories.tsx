import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { GridSkeleton, InsightsSkeleton, ListSkeleton, PageCanvasSkeleton, PageSkeleton, SectionSkeleton, TabSkeleton } from "@/components/skeletons";

const meta = preview.meta({
  title: "App/Patterns/Skeletons",
  component: PageSkeleton,
  args: { body: "list" as const, width: "4xl" as const },
  argTypes: { body: { control: "select", options: ["list", "form", "grid", "cards", "insights"] }, width: { control: "select", options: [undefined, "4xl", "6xl"] } },
  parameters: { layout: "fullscreen" },
});

const loading = async ({ canvas }: { canvas: { getByRole: (role: string, o: { name: string }) => HTMLElement } }) => {
  await expect(canvas.getByRole("status", { name: "Loading" })).toBeInTheDocument();
};

/** A page streaming in: its header and a body shaped like what arrives, after a beat. */
export const Playground = meta.story({ play: loading });

/** Team, portals, keys: rows of a thumb and two lines. */
export const PageList = meta.story({ args: { body: "list" as const, width: "4xl" as const }, play: loading });
/** Settings pages that are one form. */
export const PageForm = meta.story({ args: { body: "form", width: "4xl" }, play: loading });
/** Brands: cards with a ground and a mark. */
export const PageCards = meta.story({ args: { body: "cards", width: "6xl" }, play: loading });
/** Insights: figures, a chart, two breakdowns. */
export const PageInsights = meta.story({ args: { body: "insights", width: "6xl" }, play: loading });
/** The library, full width. */
export const PageGrid = meta.story({ args: { body: "grid", width: undefined }, play: loading });

/** A brand tab's body under the header its layout keeps: the overview's shape by default. */
export const Tab = meta.story({ render: () => <TabSkeleton />, play: loading });
export const TabForm = meta.story({ render: () => <TabSkeleton body="form" width="3xl" />, play: loading });
export const TabNarrowForm = meta.story({ render: () => <TabSkeleton body="form" width="2xl" />, play: loading });
export const TabGrid = meta.story({ render: () => <TabSkeleton body="grid" />, play: loading });
export const TabList = meta.story({ render: () => <TabSkeleton body="list" />, play: loading });
export const TabInsights = meta.story({ render: () => <TabSkeleton body="insights" />, play: loading });

/** A settings section, a form's shape. */
export const Section = meta.story({ render: () => <SectionSkeleton />, parameters: { layout: "padded" }, play: loading });

/** The pieces, as panels use them: the library grid (12, 8 or 4 tiles), a list, a guidelines page, insights. */
export const Grid = meta.story({ render: () => <GridSkeleton count={8} />, parameters: { layout: "padded" } });
export const GridOnAPhone = meta.story({ render: () => <GridSkeleton count={4} />, parameters: { layout: "padded" }, globals: { viewport: { value: "phone" } } });
export const List = meta.story({ render: () => <ListSkeleton />, parameters: { layout: "padded" } });
export const GuidelinesPage = meta.story({ render: () => <PageCanvasSkeleton /> });
export const Insights = meta.story({ render: () => <InsightsSkeleton />, parameters: { layout: "padded" } });
