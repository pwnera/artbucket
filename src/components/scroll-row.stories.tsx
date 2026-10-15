import preview from "#.storybook/preview";
import { expect, waitFor } from "storybook/test";
import { ScrollRow } from "@/components/scroll-row";

const TABS = ["Overview", "Rules", "Guidelines", "Assets", "Portal", "Insights", "Activity", "Settings"];

const meta = preview.meta({
  title: "App/Patterns/Scroll row",
  component: ScrollRow,
  args: { label: "Acme", current: "Overview", children: null },
  argTypes: { current: { control: "select", options: TABS } },
  render: (args) => (
    <ScrollRow {...args} className="flex max-w-full gap-1 border-b">
      {TABS.map((t) => (
        <a
          key={t}
          href={`#${t.toLowerCase()}`}
          aria-current={t === args.current ? "page" : undefined}
          className="aria-[current=page]:border-primary aria-[current=page]:text-foreground text-muted-foreground shrink-0 border-b-2 border-transparent px-3 py-2 text-sm"
        >
          {t}
        </a>
      ))}
    </ScrollRow>
  ),
});

/** Wide enough: a plain row, no fade. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    const nav = canvas.getByRole("navigation", { name: "Acme" });
    await expect(nav.style.maskImage).toBe("");
  },
});

/** On a phone: the far edge fades where more tabs wait, and the current one is brought into view. */
export const Phone = meta.story({
  args: { current: "Settings" },
  globals: { viewport: { value: "phone" } },
  decorators: [(Story) => <div className="w-72">{Story()}</div>],
  play: async ({ canvas }) => {
    const nav = canvas.getByRole("navigation", { name: "Acme" });
    await waitFor(() => expect(nav.scrollLeft).toBeGreaterThan(0));
    await waitFor(() => expect(nav.style.maskImage).toContain("transparent"));
  },
});
