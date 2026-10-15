import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, screen, waitFor, within } from "storybook/test";
import { me, NOW, recorder, viewer, withMe } from "#.storybook/fixtures/brands";
import { FeaturesPanel, type FeatureItem } from "@/components/settings/features";

const sent = recorder();
const feature = (f: Partial<FeatureItem> & Pick<FeatureItem, "id" | "name" | "description">): FeatureItem => ({
  off: null,
  icon: null,
  builtin: true,
  levels: ["organization", "project"],
  default: "on",
  available: true,
  manage: null,
  rule: "on",
  projects: null,
  on: true,
  from: "default",
  editable: true,
  set: null,
  ...f,
});
const set = { by: "Ada Lovelace", at: new Date(NOW.getTime() - 3 * 86_400_000).toISOString() };
const agents = feature({ id: "agents", name: "Agents and API keys", description: "Connect agents over MCP, and make API keys.", icon: "robot", off: "keys stop working", set });
const shares = feature({ id: "shares", name: "Share links", description: "Links to collections and upload requests, no account needed.", icon: "link", rule: "projects", projects: { on: 1, total: 2 } });
const hub = feature({ id: "hub", name: "BrandHub", description: "Public listings of released brands, for anyone and agents.", icon: "hub", levels: ["organization"], rule: "off", on: false, default: "off" });
const intel = feature({ id: "intelligence", name: "Intelligence", description: "Tagging and brand import, by a model.", icon: "sparkles", builtin: false, manage: "/api/v1/features/intelligence/manage", from: "project", set });
const insights = feature({ id: "insights", name: "Insights", description: "Where your assets are used, and what is out of date there.", icon: "chart", available: false });

const meta = preview.meta({
  title: "App/Features/Settings/Features",
  component: FeaturesPanel,
  args: { features: [agents, shares, hub, insights], context: "organization" as const, upgrade: "https://app.artbucket.test/billing" },
  argTypes: { context: { control: "inline-radio", options: ["organization", "project"] } },
  decorators: [withMe(me)],
  beforeEach: () => {
    sent.reset();
    // "3 days ago" read against a fixed now; swapped by hand, as a spy on Date.now recurses through the test's instrumentation.
    const real = Date.now;
    Date.now = () => NOW.getTime();
    return () => void (Date.now = real);
  },
});

/** At the organization: on, off or each project's call; one not on the plan leads to the plans. */
export const Playground = meta.story({});

/** Leaving a feature to each project asks nothing first when the impact says so, then switches it. */
export const Toggle = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/features/:id/impact", () => HttpResponse.json({ data: { changes: 0, confirm: false, title: "", says: [], action: "" } })),
      sent.on("put", "/api/v1/features/:id", {}),
    ),
  play: async ({ canvas, userEvent }) => {
    const group = canvas.getByRole("radiogroup", { name: "Agents and API keys for the organization" });
    await userEvent.click(within(group).getByRole("radio", { name: "Each project" }));
    await waitFor(() => expect(sent.last("PUT")).toEqual({ path: "/api/v1/features/agents?context=organization", body: { state: "projects" } }));
    await expect(await screen.findByText("Each project decides about Agents and API keys now")).toBeInTheDocument();
  },
});

/** Turning one off that reaches outside (keys, links) asks first, saying what stops. */
export const ToggleAsks = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/features/:id/impact", () =>
        HttpResponse.json({
          data: { changes: 3, confirm: true, title: "Turn off Agents and API keys?", says: ["3 API keys stop working at once.", "Agents connected over MCP are signed out."], action: "Turn off" },
        }),
      ),
      sent.on("put", "/api/v1/features/:id", {}),
    ),
  play: async ({ canvas, userEvent }) => {
    const group = canvas.getByRole("radiogroup", { name: "Agents and API keys for the organization" });
    await userEvent.click(within(group).getByRole("radio", { name: "Off" }));
    await expect(await screen.findByText("3 API keys stop working at once.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(sent.last("PUT")?.body).toEqual({ state: "off" }));
    await expect(await screen.findByText("Agents and API keys off for every project")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(), { timeout: 5000 });
  },
});

/** The switch refused: the API's message, and nothing moves. */
export const ToggleFails = meta.story({
  args: { context: "project", features: [agents, intel] },
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/features/:id/impact", () => HttpResponse.json({ data: { changes: 0, confirm: false, title: "", says: [], action: "" } })),
      sent.on("put", "/api/v1/features/:id", { code: "forbidden", message: "The organization turned this on for every project" }, 422),
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("switch", { name: "Agents and API keys" }));
    await waitFor(() => expect(sent.last("PUT")).toEqual({ path: "/api/v1/features/agents?context=project", body: { state: "off" } }));
    await expect(await screen.findByText("The organization turned this on for every project")).toBeInTheDocument();
  },
});

/** In a project: its own switches, and Manage for a server feature that has a view of its own. */
export const Project = meta.story({
  args: { context: "project", features: [agents, intel, { ...shares, on: false, from: "organization", editable: false, set }] },
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get("/api/v1/features/intelligence/manage", () =>
        HttpResponse.json({ data: { badge: { label: "On", tone: "on" }, lead: "Tags new assets and imports brands.", sections: [{ title: "This month", meters: [{ label: "Files tagged", used: 1840, cap: 10000 }] }], refresh: null } }),
      ),
    ),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("switch", { name: "Share links" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Manage" }));
    await expect(await screen.findByText("Tags new assets and imports brands.")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** On a plan without them: no switches, the way to the plans or why not. */
export const NotOnPlan = meta.story({ args: { features: [insights], upgrade: null } });

/** Not an admin: read-only, and why. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Only the organization's admins can change this.")).toBeInTheDocument();
    await expect(within(canvas.getByRole("radiogroup", { name: "Agents and API keys for the organization" })).getByRole("radio", { name: "Off" })).toBeDisabled();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
