import preview from "#.storybook/preview";
import { NOW, me, withMe } from "#.storybook/fixtures/brands";
import { collections, inApp } from "#.storybook/fixtures/library";
import { delay, http, HttpResponse } from "msw";
import { expect, screen, waitFor, within } from "storybook/test";
import { Fixes, type FixesData } from "@/components/fixes";

const day = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
const asset = (id: string, title: string, version: number | null = null) => ({ id, title, version, preview: true, supersededBy: null });
const logo = asset("ast_logo_2019", "acme-logo.svg", 1);

/** GET /api/v1/fixes: a license about to end and one replaced, a site and an agent on an old logo, a site on an old component, two searches. */
const data: FixesData = {
  days: 30,
  licenseDays: 30,
  open: 5,
  licenses: [
    { asset: asset("ast_hero", "hero-spring.jpg"), expires: "2026-10-17", days: 2, replacement: null },
    { asset: asset("ast_team", "team-offsite-2024.jpg"), expires: "2026-10-24", days: 9, replacement: asset("ast_team_2026", "team-offsite-2026.jpg") },
  ],
  stale: [
    { asset: logo, replacement: asset("ast_logo", "acme-logo.svg", 2), referrer: "www.acme.test", client: null, fetches: 412, first: "2026-09-20", last: day(0), owners: 2, notified: null },
    { asset: logo, replacement: asset("ast_logo", "acme-logo.svg", 2), referrer: null, client: "Campaign Planner", fetches: 18, first: "2026-10-02", last: day(1), owners: 1, notified: { at: day(3), by: "Ada Lovelace" } },
  ],
  components: [{ site: { id: "sit_portal", name: "Acme brand portal", slug: "acme" }, path: "/press", component: { id: "cmp_header_3", name: "Header", version: 3 }, current: { id: "cmp_header_4", version: 4 }, since: "2026-10-08" }],
  gaps: [
    { q: "winter campaign", searches: 7, first: "2026-10-01", last: "2026-10-14", requested: null },
    { q: "team photo", searches: 3, first: "2026-09-28", last: "2026-10-10", requested: { at: day(5), by: "Grace Hopper" } },
  ],
};

let body: unknown;

const meta = preview.meta({
  title: "App/Features/Fixes",
  component: Fixes,
  args: { data, collections, issueUrl: null },
  decorators: [withMe(me), inApp],
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/fixes" } } },
  beforeEach: ({ msw }) => {
    body = undefined;
    msw.use(
      http.post("/api/v1/insights/notices", async ({ request }) => {
        body = await request.json();
        await delay(50);
        return HttpResponse.json({ data: { emailed: 3 } });
      }),
    );
    // "Notified 3 days ago" is read against a fixed now; swapped by hand, as a spy on Date.now recurses through the test's instrumentation.
    const real = Date.now;
    Date.now = () => NOW.getTime();
    return () => void (Date.now = real);
  },
});

/** What needs a hand, in one list: what isn't done first, each with its one action; what is, below, saying when. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("5 to do")).toBeInTheDocument();
    const todo = canvas.getByRole("heading", { name: /To do/ }).closest("section")!;
    await expect(within(todo).getByText(/its license ends in 2 days/)).toBeInTheDocument();
    await expect(within(todo).getByText("www.acme.test · Since Sep 20, 412 loads")).toBeInTheDocument();
    await expect(within(todo).getByRole("link", { name: "Open @4" })).toHaveAttribute("href", "/components/cmp_header_4");
    const done = canvas.getByRole("heading", { name: /Done/ }).closest("section")!;
    await expect(within(done).getByText("Notified 3 days ago")).toBeInTheDocument();
    await expect(within(done).getByText("Requested 5 days ago")).toBeInTheDocument();
    await expect(within(done).getByRole("link", { name: "Open the replacement" })).toHaveAttribute("href", "/assets?asset=ast_team_2026");
  },
});

/** Notify a site still on an old logo: its admins, and anyone named; the request says where and what. */
export const Notify = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Notify" }));
    const dialog = await screen.findByRole("dialog", { name: "Tell www.acme.test about the current version" });
    await expect(within(dialog).getByText(/Goes to this site's admins \(2\)/)).toBeInTheDocument();
    const field = within(dialog).getByLabelText("Also send to");
    await userEvent.type(field, "not-an-email");
    await expect(within(dialog).getByRole("alert")).toHaveTextContent("isn't an email address");
    await expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, "webmaster@acme.test");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(body).toEqual({ referrer: "www.acme.test", assets: ["ast_logo_2019"], emails: ["webmaster@acme.test"] }));
    await expect(await screen.findByText("Sent to 3 people")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** Request a search that found nothing: an upload link named after its words, in Share's dialog. */
export const RequestIt = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Request it" }));
    const dialog = await screen.findByRole("dialog", { name: /Request uploads/ });
    await expect(within(dialog).getByText("No account needed. Files wait in Review until approved.")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** With an issue tracker (FIX_ISSUE_URL): a place or a search can become an issue there. */
export const WithIssueTracker = meta.story({
  args: { issueUrl: "https://tracker.acme.test/new" },
  play: async ({ canvas }) => {
    const links = canvas.getAllByRole("link", { name: "Open an issue" });
    await expect(links[0]).toHaveAttribute("href", "https://tracker.acme.test/new?kind=stale&place=www.acme.test");
    await expect(links[1]).toHaveAttribute("href", "https://tracker.acme.test/new?kind=gap&q=winter+campaign");
  },
});

/** Everything done: the list says so, the done rows stay below. */
export const AllDone = meta.story({
  args: { data: { ...data, open: 0, licenses: data.licenses.slice(1), stale: data.stale.slice(1), components: [], gaps: data.gaps.slice(1) } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("All done. Nice.")).toBeInTheDocument();
  },
});

/** Nothing found at all. */
export const Empty = meta.story({
  args: { data: { ...data, open: 0, licenses: [], stale: [], components: [], gaps: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Nothing to fix")).toBeInTheDocument();
  },
});

/** The API didn't answer. */
export const Failed = meta.story({
  args: { data: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Fixes couldn't load. Try again in a moment.")).toBeInTheDocument();
  },
});

/** Long names wrap rather than push the action off the row. */
export const LongNames = meta.story({
  args: {
    data: {
      ...data,
      gaps: [{ q: "spring launch regional partner co-branded hero imagery for the EMEA reseller programme", searches: 12, first: "2026-10-01", last: "2026-10-14", requested: null }],
      licenses: [{ asset: asset("ast_long", "acme-international-holdings-partner-programme-hero-image-final-v3-approved.jpg"), expires: "2026-10-15", days: 0, replacement: null }],
    },
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
