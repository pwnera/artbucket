import preview from "#.storybook/preview";
import { freezeNow } from "#.storybook/fixtures/brands";
import { expect, screen } from "storybook/test";
import { BrandInsights, type BrandInsightsData } from "@/components/brand-insights";

const logo = { id: "ast_logo", title: "acme-logo.svg", version: 2, preview: true, supersededBy: null };
const hero = { id: "ast_hero", title: "hero-spring.jpg", version: null, preview: true, supersededBy: null };
// Fourteen days to the frozen today (15 October 2026), the last one partial.
const days = Array.from({ length: 14 }, (_, i) => ({ day: `2026-10-${String(2 + i).padStart(2, "0")}`, current: i < 12 ? 0 : 40 + i * 3, older: i < 12 ? 30 + i : 6 }));

/** Acme, made-up numbers: @12 two days old, the press site and an agent still on older files. */
const data: BrandInsightsData = {
  days: 30,
  pulls: 1284,
  views: 5310,
  week: { days: 7, answers: 412, agents: 268, refused: 9 },
  adoption: {
    release: { number: 12, publishedAt: "2026-10-13T12:00:00Z" },
    days,
    share: 72,
    older: [
      { asset: logo, release: 11, referrer: "press.acme.test", surface: "public", client: null, fetches: 48, last: "2026-10-15" },
      { asset: hero, release: 11, referrer: null, surface: "mcp", client: "Claude", fetches: 12, last: "2026-10-14" },
      { asset: logo, release: 10, referrer: null, surface: "portal", client: null, fetches: 3, last: "2026-10-12" },
    ],
  },
};

const meta = preview.meta({
  title: "App/Features/Brands/Insights",
  component: BrandInsights,
  args: { data },
  beforeEach: freezeNow,
});

/** The Insights tab: places still on older files, this week's answers, the fetches a day, and where the older ones go. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("3 places still load files older than @12");
    await expect(canvas.getByText("Fetches on @12")).toBeInTheDocument();
    await expect(canvas.getByText("press.acme.test")).toBeInTheDocument();
  },
});

/** The older files, by file, each with the release it came from. */
export const ByFile = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "File" }));
    await expect(await canvas.findByRole("link", { name: /acme-logo.svg/ })).toHaveAttribute("href", "/assets?asset=ast_logo");
  },
});

/** Everyone on the latest release: no warning, and the breakdown says so. */
export const AllOnLatest = meta.story({
  args: { data: { ...data, adoption: { ...data.adoption!, share: 100, older: [] } } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
    await expect(canvas.getByText("Everyone loads @12.")).toBeInTheDocument();
  },
});

/** Never released (Northwind): no adoption tile, and why. */
export const NeverReleased = meta.story({
  args: { data: { days: 30, pulls: 0, views: 0, week: { days: 7, answers: 0, agents: 0, refused: 0 }, adoption: null } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Never released: adoption starts with the first release.")).toBeInTheDocument();
  },
});

/** Insights couldn't be read. */
export const Failed = meta.story({
  args: { data: null },
  play: async () => {
    await expect(screen.getByText(/Insights couldn't load/)).toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
