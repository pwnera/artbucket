import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, screen, waitFor } from "storybook/test";
import { activity as fixed, as, NOW } from "#.storybook/fixtures/library";
import { ActivityFeed, Initials } from "@/components/activity";

/** The fixtures moved to now, so "2 hours ago", the day headings and the 30 days a delete restores for read the same on any day. */
const activity = { ...fixed, data: fixed.data.map((i) => ({ ...i, at: new Date(Date.parse(i.at) + Date.now() - NOW).toISOString() })) };

/**
 * Who did what (ActivityFeed): every asset added, suggested, decided, deleted or restored, and every change to a
 * brand's rules, newest first, grouped by day; runs of one agent doing one thing fold into a row. ?who= filters it.
 */
const meta = preview.meta({
  title: "App/Features/Library/Activity",
  component: ActivityFeed,
  decorators: [as],
  args: { first: activity },
  parameters: { nextjs: { navigation: { pathname: "/insights/activity" } } },
});

/** A day of agents and people: a burst of three suggestions, a rejection with its note, a release. */
export const Playground = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("3 assets"));
    await expect(canvas.getByRole("link", { name: "autumn-lookbook-02.jpg" })).toHaveAttribute("href", "/assets?asset=ast_lb2");
    await expect(canvas.getByText("“Out of focus, and the logo is cropped”")).toBeInTheDocument();
    await expect(canvas.getByText("That's everything.")).toBeInTheDocument();
  },
});

/** Restore a deleted asset from its row, within 30 days. */
export const Restore = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.post("/api/v1/assets/:id/restore", () => HttpResponse.json({ data: {} }))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Restore draft-banner.png" }));
    await expect(await screen.findByText("Restored draft-banner.png")).toBeInTheDocument();
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Restore draft-banner.png" })).not.toBeInTheDocument());
  },
});

/** Agents only (?who=agents). */
export const Agents = meta.story({
  parameters: { nextjs: { navigation: { pathname: "/insights/activity", query: { who: "agents" } } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("radio", { name: "Agents" })).toBeChecked();
    await expect(canvas.queryByText("Omar Haddad")).not.toBeInTheDocument();
  },
});

/** Nothing loaded matches the filter, and there may be more further back. */
export const FilteredEmpty = meta.story({
  args: { first: { data: activity.data.filter((i) => !i.agent), next: "2026-10-01T00:00:00Z" } },
  parameters: { nextjs: { navigation: { pathname: "/insights/activity", query: { who: "agents" } } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/No agent activity in the latest/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Load older" })).toBeInTheDocument();
  },
});

/** Older pages on demand. */
export const LoadOlder = meta.story({
  args: { first: { data: activity.data.slice(0, 4), next: activity.data[3].at } },
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/activity", () => HttpResponse.json({ data: activity.data.slice(4) }))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Load older" }));
    await expect(await canvas.findByText("Omar Haddad")).toBeInTheDocument();
  },
});

/** A new project: nothing yet. */
export const Empty = meta.story({
  args: { first: { data: [], next: null } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Nothing yet")).toBeInTheDocument();
  },
});

/** A viewer: the feed, no Restore. */
export const Viewer = meta.story({
  parameters: { app: { scope: "read" } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: /^Restore/ })).not.toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

/** Someone's initials on a tint of their own: the same person, the same color, on every list. */
export const Faces = meta.story({
  render: () => (
    <div className="flex gap-2">
      {["Dana Reyes", "Omar Haddad", "lena@northwind.test", "Campaign agent", "Web app", "Sam Okafor"].map((n) => (
        <Initials key={n} name={n} />
      ))}
    </div>
  ),
});
