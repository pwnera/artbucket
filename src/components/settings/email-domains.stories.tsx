import preview from "#.storybook/preview";
import { expect, screen, waitFor } from "storybook/test";
import { me, recorder, viewer, withMe } from "#.storybook/fixtures/brands";
import { EmailDomainsPanel, type EmailDomain } from "@/components/settings/email-domains";

const sent = recorder();
const record = (domain: string) => ({ type: "TXT" as const, name: `_artbucket.${domain}`, value: "artbucket-verify=2b8e41d0" });
const pending: EmailDomain = { domain: "northwind.test", verified: false, join: false, projectId: null, sso: false, record: record("northwind.test") };
const open: EmailDomain = { domain: "acme.test", verified: true, join: true, projectId: "prj_northwind", sso: false, record: record("acme.test") };
const closed: EmailDomain = { ...open, domain: "acme-labs.test", join: false, projectId: null, record: record("acme-labs.test") };
const sso: EmailDomain = { ...open, domain: "acme-corp.test", join: false, sso: true, record: record("acme-corp.test") };
const projects = [
  { id: "prj_acme", name: "Acme" },
  { id: "prj_northwind", name: "Northwind" },
];

const meta = preview.meta({
  title: "App/Features/Settings/Email domains",
  component: EmailDomainsPanel,
  args: { domains: [pending, open, closed, sso], projects },
  decorators: [withMe(me)],
  beforeEach: () => sent.reset(),
});

/** Each verify state: waiting for its TXT record, verified and open to join, verified and closed, used by single sign-on. */
export const Playground = meta.story({});

/** None yet: only the field to add one. Adding sends the domain, and says to add its record. */
export const Empty = meta.story({
  args: { domains: [] },
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/email-domains", pending)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Add an email domain"), "northwind.test");
    await userEvent.click(canvas.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/email-domains", body: { domain: "northwind.test" } }));
    await expect(await screen.findByText("Added northwind.test")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Add an email domain")).toHaveValue("");
  },
});

/** A domain another organization proved, or that isn't one: the API's message, and what was typed stays. */
export const AddFails = meta.story({
  args: { domains: [] },
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/email-domains", { code: "conflict", message: "Another organization uses acme.test" }, 422)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Add an email domain"), "acme.test");
    await userEvent.click(canvas.getByRole("button", { name: "Add" }));
    await expect(await screen.findByText("Another organization uses acme.test")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Add an email domain")).toHaveValue("acme.test");
  },
});

/** Waiting for its record: Check now asks the server to look. */
export const Verify = meta.story({
  args: { domains: [pending] },
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/email-domains/:domain/verify", { ...pending, verified: true })),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("_artbucket.northwind.test")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Check now" }));
    await waitFor(() => expect(sent.last("POST")?.path).toBe("/api/v1/email-domains/northwind.test/verify"));
    await expect(await screen.findByText("northwind.test is verified")).toBeInTheDocument();
  },
});

/** The record isn't found yet: said, and the domain still waits. */
export const VerifyFails = meta.story({
  args: { domains: [pending] },
  beforeEach: ({ msw }) =>
    void msw.use(sent.on("post", "/api/v1/email-domains/:domain/verify", { code: "not_found", message: "No TXT record at _artbucket.northwind.test yet" }, 422)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Check now" }));
    await expect(await screen.findByText("No TXT record at _artbucket.northwind.test yet")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Check now" })).toBeEnabled();
  },
});

/** Opening a verified domain to join, then picking where people land. */
export const Join = meta.story({
  args: { domains: [closed, open] },
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/email-domains/:domain", {})),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("switch", { name: "Anyone at acme-labs.test can join, able to read" }));
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/email-domains/acme-labs.test", body: { join: true } }));
    await expect(await screen.findByText("Anyone at acme-labs.test can join now")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("combobox", { name: "They land in" }));
    await userEvent.click(await screen.findByRole("option", { name: "Acme" }));
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/email-domains/acme.test", body: { projectId: "prj_acme" } }));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  },
});

/** Removing one asks first; one single sign-on uses can't be removed here. */
export const Remove = meta.story({
  args: { domains: [closed, sso] },
  beforeEach: ({ msw }) => void msw.use(sent.on("delete", "/api/v1/email-domains/:domain", {})),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole("button", { name: "Remove acme-corp.test" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Remove acme-labs.test" }));
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(sent.last("DELETE")?.path).toBe("/api/v1/email-domains/acme-labs.test"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(), { timeout: 5000 });
  },
});

/** Not an organization admin: read-only, and why. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Only the organization's admins can change this.")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Add an email domain")).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Check now" })).toBeDisabled();
  },
});

export const LongNames = meta.story({
  args: {
    domains: [{ ...pending, domain: "marketing.emea.acme-international-holdings.test", record: record("marketing.emea.acme-international-holdings.test") }],
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
