import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { UsagePanel, type Usage } from "@/components/settings/panels";
import { UNLIMITED } from "@/lib/limits";

const GB = 1024 ** 3;
const usage: Usage = {
  limits: { ...UNLIMITED, storage: 50 * GB, editors: 5, projects: 3, brands: 3, domains: 1, features: ["agents", "shares", "sso", "branding", "domains"] },
  billing: "https://app.artbucket.test/billing",
  used: { storage: 42 * GB, editors: 5, projects: 2, brands: 1, domains: 0 },
  traffic: {
    days: 30,
    projects: [
      { id: "prj_acme", name: "Acme", storage: 38 * GB, requests: 182_400, bytes: 96 * GB },
      { id: "prj_northwind", name: "Northwind", storage: 4 * GB, requests: 9_120, bytes: 3 * GB },
    ],
    daily: [],
  },
};

const meta = preview.meta({
  title: "App/Features/Settings/Usage",
  component: UsagePanel,
  args: { usage },
});

/** On a plan: storage near its limit (amber), editors at it (red), rebuilds not on the plan, and Manage plan. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("progressbar", { name: "Storage used" })).toBeInTheDocument();
    await expect(canvas.getByText(/Off here: rebuilding sites when a brand is released/)).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Manage plan" })).toHaveAttribute("href", "https://app.artbucket.test/billing");
  },
});

/** Set by whoever runs the server, without limits: nothing to fill, nowhere to pay. */
export const Unlimited = meta.story({ args: { usage: { ...usage, limits: UNLIMITED, billing: null } } });

/** Nothing served yet. */
export const Empty = meta.story({ args: { usage: { ...usage, used: { storage: 0, editors: 1, projects: 1, brands: 0, domains: 0 }, traffic: { days: 30, projects: [], daily: [] } } } });

/** Read-only: everyone can look, nobody can change anything. */
export const ReadOnly = meta.story({ args: { usage: { ...usage, limits: { ...usage.limits, readOnly: true } } } });

/** Suspended by the operator, and why. */
export const Suspended = meta.story({ args: { usage: { ...usage, limits: { ...usage.limits, readOnly: true, suspended: "Unpaid since September" } } } });

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
