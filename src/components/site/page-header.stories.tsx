import preview from "#.storybook/preview";
import { expect, fn, within } from "storybook/test";
import { PageHeader } from "@/components/site/page-header";
import { bookView, rootsOf, StorySite } from "@/components/site/story-site";
import type { PageView } from "@/lib/site";

const typography = bookView("blender", "typography");
const banded = (v: PageView): PageView => ({ ...v, theme: { ...v.theme, band: true } });

/**
 * The top of a page: the trail up to it, its number and eyebrow, its title and lede, when it last changed, and a
 * page whose children are tabs, those pages as tabs. A page opening on a cover leaves its heading to the cover.
 */
const meta = preview.meta({
  title: "Brand site/Parts/Page header",
  component: PageHeader,
  args: { page: typography.page!, roots: rootsOf(typography), onNavigate: fn() },
  decorators: [(Story, { args }) => <StorySite view={bookView("blender", args.page.slug)}>{Story()}</StorySite>],
});

export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Typography" })).toBeInTheDocument();
    await expect(canvas.getByText(/Updated/)).toBeInTheDocument();
  },
});

/** A page whose children are tabs (Logo): them, under its title, the one read marked. */
export const WithTabs = meta.story({
  args: { page: bookView("blender", "logo").page! },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("navigation", { name: "Logo pages" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Logo" })).toHaveAttribute("aria-current", "page");
  },
});

/** One of those tabs (Using the logo): the trail up to its page, and the same tabs. */
export const ATab = meta.story({
  args: { page: bookView("blender", "logo-use").page! },
  play: async ({ args, canvas, userEvent }) => {
    const trail = canvas.getByRole("navigation", { name: "Breadcrumb" });
    await expect(trail).toHaveTextContent("Logo");
    await userEvent.click(within(trail).getByRole("link", { name: "Logo" }));
    await expect(args.onNavigate).toHaveBeenCalledWith("?page=logo");
  },
});

/** With the theme's `band`: on the brand's ground. */
export const Band = meta.story({
  decorators: [(Story) => <StorySite view={banded(typography)}>{Story()}</StorySite>],
});

/** A book read right to left. */
export const RightToLeft = meta.story({
  args: { page: bookView("rtl", "typography").page!, roots: rootsOf(bookView("rtl", "typography")) },
  decorators: [(Story) => <StorySite view={bookView("rtl", "typography")}>{Story()}</StorySite>],
});
