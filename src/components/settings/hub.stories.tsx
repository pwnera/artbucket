import preview from "#.storybook/preview";
import { useSelectedLayoutSegments } from "@storybook/nextjs-vite/navigation.mock";
import { expect, mocked, screen, waitFor, within } from "storybook/test";
import { me, recorder, viewer, withMe } from "#.storybook/fixtures/brands";
import { inApp } from "#.storybook/fixtures/library";
import { HubPanel, type GithubAccount, type HubReport } from "@/components/settings/hub";
import { SettingsShell } from "@/components/settings/shell";

const sent = recorder();
// Against the real now: lib/hub's ago() reads new Date(), not Date.now, so the dates move with it and it always says "yesterday".
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const account = (login: string, verified: boolean): GithubAccount => ({
  login,
  verified,
  url: `https://github.com/${login}`,
  file: { repository: `${login}/.github`, path: "artbucket-verify.txt", url: `https://github.com/${login}/.github`, token: "artbucket-verify=91c0fa7e" },
});
const brand = { slug: "acme", name: "Acme", project: "Acme", visibility: "public" as const };
const reports: HubReport[] = [
  { id: "rep_claim", kind: "claim", reason: "owner", note: "We are Acme Rockets, and acme.test is ours.", contact: "legal@acme-rockets.test", claimant: { name: "Acme Rockets", proof: "acme-rockets.test" }, status: "open", createdAt: ago(1), brand },
  { id: "rep_old", kind: "report", reason: "inaccurate", note: null, contact: null, claimant: null, status: "resolved", createdAt: ago(40), brand: { ...brand, slug: "northwind", name: "Northwind", visibility: "private" } },
];
const domains = [
  { host: "acme.test", verified: true },
  { host: "assets.acme.test", verified: false },
];
const offers = [{ id: "off_1", org: "unclaimed", owner: "Unclaimed brands", brand: "acme", name: "Acme", domain: "acme.test", proof: "DNS TXT record on acme.test", url: "https://hub.artbucket.test/unclaimed/acme" }];

const meta = preview.meta({
  title: "App/Features/Settings/BrandHub",
  component: HubPanel,
  args: { github: [account("acme", true), account("acme-labs", false)], reports, domains, offers },
  decorators: [withMe(me)],
  beforeEach: () => sent.reset(),
});

/** Verified by a domain and a GitHub account, a listing its domain may claim, one account waiting, a claim to act on. */
export const Playground = meta.story({});

/** Nothing proved yet: community listings, no accounts, no reports. */
export const Empty = meta.story({
  args: { github: [], reports: [], domains: [], offers: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Community")).toBeInTheDocument();
    await expect(canvas.getByText("Nothing yet.")).toBeInTheDocument();
  },
});

/** Adding a GitHub account, then checking its file. */
export const AddGithub = meta.story({
  args: { github: [account("acme-labs", false)] },
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/github-orgs", account("rust-lang", false)), sent.on("post", "/api/v1/github-orgs/:login/verify", account("acme-labs", true))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Add a GitHub account"), "rust-lang");
    await userEvent.click(canvas.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/github-orgs", body: { login: "rust-lang" } }));
    await expect(await screen.findByText("Added github.com/rust-lang")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Check now" }));
    await waitFor(() => expect(sent.last("POST")?.path).toBe("/api/v1/github-orgs/acme-labs/verify"));
  },
});

/** The file isn't there: GitHub's answer, said, and the account still waits. */
export const VerifyFails = meta.story({
  args: { github: [account("acme-labs", false)] },
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/github-orgs/:login/verify", { code: "not_found", message: "No artbucket-verify.txt in acme-labs/.github" }, 422)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Check now" }));
    await expect(await screen.findByText("No artbucket-verify.txt in acme-labs/.github")).toBeInTheDocument();
  },
});

/** A claim: take the listing off BrandHub (private from then on), or resolve it. */
export const Visibility = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/hub/reports/:id", {})),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Take off BrandHub" }));
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/hub/reports/rep_claim", body: { delist: true, status: "resolved" } }));
    await expect(await screen.findByText("Acme is off BrandHub")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/hub/reports/rep_old", body: { status: "open" } }));
  },
});

/** Not an organization admin: read-only, and why. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Only the organization's admins can change this.")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Take off BrandHub" })).toBeDisabled();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

/**
 * In the app, as Settings, Organization, BrandHub shows it, for artbucket.io's solution pages: a GitHub account
 * added, waiting for the one file that proves it, no domain needed.
 */
export const InSettings = meta.story({
  args: { github: [account("acme", false)], reports: [], domains: [], offers: [] },
  render: (args) => (
    <SettingsShell>
      <HubPanel {...args} />
    </SettingsShell>
  ),
  decorators: [inApp],
  parameters: { layout: "fullscreen", app: { me: { hub: true } }, nextjs: { navigation: { pathname: "/settings/organization/hub" } } },
  beforeEach: () => void mocked(useSelectedLayoutSegments).mockReturnValue(["(sections)", "organization", "hub"]),
  play: async ({ canvas }) => {
    await expect(within(canvas.getByRole("navigation", { name: "Settings" })).getByRole("link", { name: "BrandHub" })).toHaveAttribute("aria-current", "page");
    await expect(canvas.getByRole("button", { name: "Check now" })).toBeInTheDocument();
  },
});
