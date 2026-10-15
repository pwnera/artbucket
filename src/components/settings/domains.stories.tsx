import preview from "#.storybook/preview";
import { expect, screen, waitFor } from "storybook/test";
import { me, recorder, viewer, withMe } from "#.storybook/fixtures/brands";
import { DomainsPanel, type Domain } from "@/components/settings/branding";

const sent = recorder();
const domain = (host: string, d: Partial<Domain> = {}): Domain => ({
  host,
  verified: true,
  app: false,
  primary: false,
  record: { type: "TXT", name: `_artbucket.${host}`, value: "artbucket-verify=5d2a7c90" },
  cname: { type: "CNAME", name: host, value: "domains.artbucket.test" },
  portal: null,
  url: `https://${host}`,
  ...d,
});
const app = domain("assets.acme.test", { app: true, primary: true });
const second = domain("brand.acme.test", { app: true });
const portal = domain("press.acme.test", { portal: "press" });
const pending = domain("media.acme.test", { verified: false });

const meta = preview.meta({
  title: "App/Features/Settings/Domains",
  component: DomainsPanel,
  args: { domains: [app, second, portal, pending] },
  decorators: [withMe(me)],
  beforeEach: () => sent.reset(),
});

/** The app at two addresses (one the default), one a portal's, one waiting for its DNS. */
export const Playground = meta.story({});

/** None yet: adding one sends the host and says to add its records. */
export const Empty = meta.story({
  args: { domains: [] },
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/domains", pending)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Add a domain"), "media.acme.test");
    await userEvent.click(canvas.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/domains", body: { host: "media.acme.test" } }));
    await expect(await screen.findByText("Added media.acme.test")).toBeInTheDocument();
  },
});

/** Taken, or not a host: the API's message, and what was typed stays. */
export const AddFails = meta.story({
  args: { domains: [] },
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/domains", { code: "invalid", message: "That isn't a domain name" }, 422)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Add a domain"), "not a host");
    await userEvent.click(canvas.getByRole("button", { name: "Add" }));
    await expect(await screen.findByText("That isn't a domain name")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Add a domain")).toHaveValue("not a host");
  },
});

/** Waiting for DNS: both records to copy, and Check now. */
export const Verify = meta.story({
  args: { domains: [pending] },
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/domains/:host/verify", { ...pending, verified: true })),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("domains.artbucket.test")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Check now" }));
    await waitFor(() => expect(sent.last("POST")?.path).toBe("/api/v1/domains/media.acme.test/verify"));
    await expect(await screen.findByText("media.acme.test is verified")).toBeInTheDocument();
  },
});

/** Turning the app on at a verified domain, and making another the default for links in email. */
export const UseForApp = meta.story({
  args: { domains: [app, second, domain("cdn.acme.test")] },
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/domains/:host", {})),
  play: async ({ canvas, userEvent }) => {
    const switches = canvas.getAllByRole("switch", { name: "Use for the app" });
    await userEvent.click(switches[2]!);
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/domains/cdn.acme.test", body: { app: true } }));
    await userEvent.click(canvas.getByRole("button", { name: "Make default" }));
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/domains/brand.acme.test", body: { primary: true } }));
  },
});

/** Removing one asks, saying where its portal goes back to. */
export const Remove = meta.story({
  args: { domains: [portal] },
  beforeEach: ({ msw }) => void msw.use(sent.on("delete", "/api/v1/domains/:host", {})),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove press.acme.test" }));
    await expect(await screen.findByText("The portal goes back to /p/press.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(sent.last("DELETE")?.path).toBe("/api/v1/domains/press.acme.test"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(), { timeout: 5000 });
  },
});

/** Not an organization admin: read-only, and why. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Only the organization's admins can change this.")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Add a domain")).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Check now" })).toBeDisabled();
  },
});

export const LongNames = meta.story({ args: { domains: [domain("brand-assets.marketing.emea.acme-international-holdings.test", { verified: false })] } });

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
