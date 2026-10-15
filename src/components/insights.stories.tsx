import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { as, collections, inApp, insights } from "#.storybook/fixtures/library";
import { InsightsBody, InsightsFrame, NotifyDialog, type InsightsData } from "@/components/insights";

let notices: unknown[] = [];

/**
 * Insights (InsightsBody): Overview is brand answers, release adoption and who still loads an old version, the most
 * used assets by surface, search gaps and portal views; Use checks is the check log with what was refused and why.
 */
const meta = preview.meta({
  title: "App/Features/Library/Insights",
  component: InsightsBody,
  decorators: [as],
  args: { data: insights, tab: "overview" as const, collections },
  parameters: { layout: "padded" },
  beforeEach: ({ msw }) => {
    notices = [];
    msw.use(
      http.post("/api/v1/insights/notices", async ({ request }) => {
        notices.push(await request.json());
        return HttpResponse.json({ data: { emailed: 3 } });
      }),
      http.get("/api/v1/shares", () => HttpResponse.json({ data: [] })),
    );
  },
});

/** The overview: a warning that a site still loads a replaced logo, the figures and their chart, four breakdowns. */
export const Overview = meta.story({
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("1 site still loads a replaced version");
    await userEvent.click(canvas.getByRole("button", { name: /Requests/ }));
    await expect(canvas.getByRole("img", { name: /Requests/ })).toBeInTheDocument();
  },
});

/** Notify the site still on the old logo: its admins, and someone more by email. */
export const Notify = meta.story({
  play: async ({ canvas, userEvent }) => {
    const where = canvas.getByRole("region", { name: "Where from" });
    await userEvent.click(within(where).getByRole("tab", { name: "Old versions" }));
    await userEvent.click(await within(where).findByRole("button", { name: "Notify" }));
    const dialog = await screen.findByRole("dialog", { name: "Tell shop.northwind.test about the current version" });
    await userEvent.type(within(dialog).getByLabelText("Also send to"), "webmaster@northwind.test");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(notices).toEqual([{ referrer: "shop.northwind.test", assets: ["ast_old_logo"], emails: ["webmaster@northwind.test"] }]));
    await expect(await screen.findByText("Sent to 3 people")).toBeInTheDocument();
  },
});

/** A search gap asked for: an upload link named after its words. */
export const RequestIt = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Request it" }));
    const dialog = await screen.findByRole("dialog", { name: "Request uploads" });
    await expect(within(dialog).getByLabelText("What they see it called")).toHaveValue("holiday banner");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  },
});

/** Use checks: the figures, recent refusals and what was offered, by reason, and Export CSV. */
export const Checks = meta.story({
  args: { tab: "checks" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("table")).toHaveTextContent("Newsletter agent");
    await expect(canvas.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  },
});

const quiet: InsightsData = { ...insights, answers: [], adoption: [], stale: [], top: [], gaps: [], delivery: [], pageViews: [], checks: { allowed: 0, refused: 0, reasons: [], log: [] } };

/** A new project: nothing counted yet. */
export const Quiet = meta.story({ args: { data: quiet } });

/** Nothing refused. */
export const ChecksQuiet = meta.story({ args: { data: quiet, tab: "checks" } });

/** Insights couldn't load. */
export const Failed = meta.story({
  args: { data: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Insights couldn't load. Try again in a moment.")).toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

/** An agent's place, whose person the server knows: it goes to them without an address. */
export const NotifyAgent = meta.story({
  render: () => <NotifyDialog place={{ referrer: null, client: "Newsletter agent", owners: 1, assets: [insights.stale[0].asset] }} onClose={fn()} onSent={fn()} />,
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await expect(within(dialog).getByText("Goes to the person who connected this agent (1).")).toBeInTheDocument();
  },
});

/** A place nobody is known for: an address is needed, and a wrong one is said. */
export const NotifyUnknown = meta.story({
  render: () => <NotifyDialog place={{ referrer: "blog.example.test", client: null, owners: 0, assets: [insights.stale[0].asset] }} onClose={fn()} onSent={fn()} />,
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog");
    await expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Send to"), "nope");
    await expect(within(dialog).getByRole("alert")).toHaveTextContent("“nope” isn't an email address.");
  },
});

/** The page around it (InsightsFrame): the header, and the tabs with the refusals counted. */
export const Page = meta.story({
  decorators: [inApp],
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/insights", segments: [] } } },
  render: (args) => (
    <InsightsFrame refused={86}>
      <InsightsBody {...args} />
    </InsightsFrame>
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "Insights", level: 1 }, { timeout: 5000 })).toBeInTheDocument();
  },
});
