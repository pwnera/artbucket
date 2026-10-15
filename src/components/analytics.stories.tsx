import preview from "#.storybook/preview";
import { useState } from "react";
import { expect, fn, within } from "storybook/test";
import { insights } from "#.storybook/fixtures/library";
import { BarList, Breakdown, ComboChart, Kpis, type Kpi } from "@/components/analytics";

const kpis: Kpi[] = [
  { id: "answers", label: "Brand answers", value: "4,210", delta: 18, against: "vs the 3 weeks before", chart: true },
  { id: "agents", label: "By agents", value: "38%", delta: 6, against: "vs the 3 weeks before", chart: true },
  { id: "bytes", label: "Served", value: "2.4 GB", delta: -4, chart: true },
  { id: "replaced", label: "Replaced fetched", value: "449", delta: 12, rising: "bad" },
  { id: "new", label: "Portal views", value: "3,070", delta: null },
  { id: "refused", label: "Uses refused", value: "86" },
];

const answers = insights.answers.map((a) => ({ ...a, total: a.person + a.agent + a.anonymous }));

/** The KPI strip as Insights drives it: a pick changes the chart. */
function Strip({ onPick }: { onPick: (id: string) => void }) {
  const [picked, setPicked] = useState("answers");
  return (
    <Kpis
      items={kpis}
      picked={picked}
      onPick={(id) => {
        setPicked(id);
        onPick(id);
      }}
    />
  );
}

/**
 * Analytics, as DataFast draws them (Kpis, ComboChart, Breakdown, BarList): numbers that pick the chart under them, a
 * line over bars, and breakdowns whose tabs regroup the same rows. Plain SVG and boxes, no chart library.
 */
const meta = preview.meta({
  title: "App/Features/Library/Analytics",
  component: Kpis,
  args: { items: kpis },
});

/** The strip: each figure a button that picks the chart; a rise in red where rising is bad. */
export const Figures = meta.story({
  args: { onPick: fn() },
  render: (args) => <Strip onPick={args.onPick!} />,
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Served/ }));
    await expect(args.onPick).toHaveBeenCalledWith("bytes");
    await expect(canvas.getByRole("button", { name: /Served/ })).toHaveAttribute("aria-pressed", "true");
  },
});

/** Brand answers a week, agents as bars under them, this week dashed. Arrow keys read each column. */
export const Chart = meta.story({
  render: () => (
    <ComboChart
      rows={answers}
      x={(r) => `Week of ${r.week}`}
      tick={(r) => r.week.slice(5)}
      partial
      line={{ key: "total", label: "Brand answers" }}
      bars={{ key: "agent", label: "By agents" }}
      detail={(r) => [{ label: "People", value: r.person.toLocaleString() }]}
    />
  ),
  play: async ({ canvas, userEvent }) => {
    const chart = canvas.getByRole("img", { name: /From Week of 2026-08-31 to Week of 2026-10-12/ });
    chart.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    await expect(within(chart).getByRole("status")).toHaveTextContent("Week of 2026-09-07");
    await userEvent.keyboard("{Escape}");
  },
});

/** A line alone, on a quiet week: gridlines still on whole numbers. */
export const QuietChart = meta.story({
  render: () => <ComboChart rows={[{ day: "Mon", n: 0 }, { day: "Tue", n: 1 }, { day: "Wed", n: 2 }]} x={(r) => r.day} line={{ key: "n", label: "Requests" }} />,
});

/** A breakdown card: tabs regroup the rows; arrows move between them. */
export const BreakdownTabs = meta.story({
  render: () => (
    <div className="max-w-lg">
      <Breakdown
        title="Where from"
        tabs={[
          { id: "surface", label: "Surface", column: "Fetches", empty: "Nothing fetched yet.", rows: [{ key: "portal", label: "Portal", value: 9_800 }, { key: "api", label: "API", value: 4_100 }, { key: "mcp", label: "MCP", value: 3_200 }] },
          { id: "sites", label: "Old versions", column: "Fetches", empty: "No site loads a replaced version.", rows: [{ key: "shop", label: "shop.northwind.test", sub: "Acme logo 2019", value: 412, tone: "warning" }] },
          { id: "none", label: "Empty", column: "Fetches", empty: "Nothing here yet.", rows: [] },
        ]}
      />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Surface" }));
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: "Old versions" })).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByRole("tabpanel")).toHaveTextContent("shop.northwind.test");
  },
});

/** A long list: eight, then Show all. */
export const LongList = meta.story({
  render: () => (
    <div className="max-w-lg">
      <BarList column="Searches" empty="Every search found something." rows={Array.from({ length: 12 }, (_, i) => ({ key: `q${i}`, label: `“query ${i + 1}”`, value: 100 - i * 7 }))} />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getAllByRole("listitem")).toHaveLength(8);
    await userEvent.click(canvas.getByRole("button", { name: "Show all 12" }));
    await expect(canvas.getAllByRole("listitem")).toHaveLength(12);
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
