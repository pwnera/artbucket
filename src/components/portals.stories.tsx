import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, screen, waitFor, within } from "storybook/test";
import { recorder } from "#.storybook/fixtures/brands";
import { inApp, renditions } from "#.storybook/fixtures/library";
import { offline, partners, pendingDomain, portal, PORTAL_DOMAIN, portals, sitesApi, team, verified } from "#.storybook/fixtures/sites";
import { Portals } from "@/components/portals";

const sent = recorder();
const made = portal({ id: "sit_new", slug: "press-kit", name: "Press kit", access: "password", password: true });

/** The page at ?{query}: the app opens a portal's editor (?edit=), a new one (?new=portal) or its requests (?open=) this way. */
const at = (query: Record<string, string> = {}) => ({ nextjs: { navigation: { pathname: "/sites", query } } });

/**
 * Sites (Portals): the project's brand portals and built sites, each row with its access, its warnings (a domain not
 * verified, a brand never released, offline), its requests, and a menu to edit, deploy, take offline or delete. New
 * site makes a brand portal (PortalDialog: what it shows, who gets in, its look, downloads, domain) or a built site.
 */
const meta = preview.meta({
  title: "App/Features/Sites/Portals",
  component: Portals,
  decorators: [inApp],
  parameters: { layout: "fullscreen", ...at() },
  args: { portals, portalDomain: PORTAL_DOMAIN },
  beforeEach: ({ msw }) => {
    sent.reset();
    msw.use(
      ...renditions,
      ...sitesApi(),
      sent.on("post", "/api/v1/sites", made),
      sent.on("patch", "/api/v1/sites/:id", verified),
      sent.on("post", "/api/v1/sites/:id/close", { ...verified, expired: true }),
      sent.on("delete", "/api/v1/sites/:id"),
      sent.on("patch", "/api/v1/sites/:id/requests/:request", { ...{ id: "req_lena", email: "lena@northwind.test", name: "Lena Park", note: null, kind: "access" }, status: "approved", expiresAt: "2027-01-13T10:00:00Z", url: null, createdAt: "2026-10-15T08:00:00Z", page: null, section: null }),
    );
  },
});

/** A few sites: a portal of each access, a built site, one elsewhere, one offline, one on a domain not verified yet. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Acme docs" })).toBeInTheDocument();
    await expect(canvas.getByText("Domain not verified")).toBeInTheDocument();
    await expect(canvas.getByText("Offline")).toBeInTheDocument();
    await expect(canvas.getByText("Northwind not released")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /2 waiting/ })).toBeInTheDocument();
    await expect(canvas.getByLabelText("Password")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Members")).toBeInTheDocument();
  },
});

/** No sites yet: a brand portal or a built site, both from here. */
export const NoSites = meta.story({
  args: { portals: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No sites yet")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Brand portal" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "Built site" })).toBeEnabled();
  },
});

/** Nothing to show on a portal yet: a collection or a brand comes first. */
export const NothingToShow = meta.story({
  args: { portals: [] },
  parameters: { app: { sidebar: { collections: [], brands: [] } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Make a collection or a brand first.")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "New collection" })).toBeInTheDocument();
  },
});

/** From a brand's Sharing tab (?brand=): only the sites showing it, and a way back to all. */
export const ShowingOneBrand = meta.story({
  args: { portals: [verified, offline, { ...team, brands: [{ slug: "northwind", name: "Northwind", publishedAt: null }] }] },
  parameters: at({ brand: "acme" }),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/The sites showing Acme/)).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Team guidelines" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Show all" })).toHaveAttribute("href", "/sites");
  },
});

/**
 * A new portal: its name gives its address, which is checked as it is typed; a collection to show; the door picked
 * with the arrow keys (a radio group); a password; then Make it. The POST carries all of it.
 */
export const CreatePortal = meta.story({
  parameters: at({ new: "portal" }),
  play: async ({ canvas, userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "New portal" });
    const it = within(dialog);
    await expect(it.getByRole("button", { name: /Make it/ })).toBeDisabled();
    await userEvent.type(it.getByLabelText("Name"), "Press kit");
    await expect(it.getByLabelText("Address")).toHaveValue("press-kit");
    await expect(await it.findByText("Available")).toBeInTheDocument();
    await userEvent.click(it.getByRole("checkbox", { name: "Press" }));
    // The door: arrow keys move through the cards, as in any radio group.
    const anyone = it.getByRole("radio", { name: /Anyone with the address/ });
    await expect(anyone).toBeChecked();
    anyone.focus();
    await userEvent.keyboard("{ArrowRight>}{/ArrowRight}");
    await waitFor(() => expect(it.getByRole("radio", { name: /Whoever has the password/ })).toBeChecked());
    await userEvent.type(it.getByLabelText("Password"), "acme-press-2026");
    await userEvent.click(it.getByRole("button", { name: /Make it/ }));
    await waitFor(() => expect(sent.last("POST")?.path).toBe("/api/v1/sites"));
    await expect(sent.last("POST")?.body).toEqual({
      name: "Press kit",
      slug: "press-kit",
      intro: null,
      access: "password",
      password: "acme-press-2026",
      expiresAt: null,
      presets: ["web", "print", "social"],
      theme: { logo: null, accent: null, background: null },
      collections: ["col_press"],
      brands: [],
      domain: null,
      site: {},
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(canvas.getByRole("button", { name: "Press kit" })).toBeInTheDocument();
    await expect(await screen.findByText("Press kit is live")).toBeInTheDocument();
  },
});

/** An address the server refuses: kept for the service, or another portal's. Said under the field as it is typed. */
export const AddressRefused = meta.story({
  parameters: at({ new: "portal" }),
  play: async ({ userEvent }) => {
    const it = within(await screen.findByRole("dialog", { name: "New portal" }));
    const address = it.getByLabelText("Address");
    await userEvent.type(address, "www");
    await expect(await it.findByText('"www" is kept for the service: pick another address')).toBeInTheDocument();
    await expect(address).toHaveAttribute("aria-invalid", "true");
    await userEvent.clear(address);
    await userEvent.type(address, "partners");
    await expect(await it.findByText("partners is taken: pick another address")).toBeInTheDocument();
    // Typed as an address: spaces become dashes, capitals and anything else drop.
    await userEvent.clear(address);
    await userEvent.type(address, "Spring Launch!");
    await expect(address).toHaveValue("spring-launch");
    await expect(await it.findByText("spring-launch is taken: pick another address")).toBeInTheDocument();
  },
});

/** Behind a password: the password field says Unchanged, and is needed only to change it. */
export const EditPasswordPortal = meta.story({
  parameters: at({ edit: partners.id }),
  play: async () => {
    const it = within(await screen.findByRole("dialog", { name: "Edit Partner hub" }));
    await expect(it.getByRole("radio", { name: /Whoever has the password/ })).toBeChecked();
    await expect(it.getByLabelText("Password")).toHaveAttribute("placeholder", "Unchanged");
    await expect(it.getByLabelText("Password")).not.toBeRequired();
  },
});

/** For the team: signed in to get in, never at {slug}.artbucket.test, and its brands' releases said. */
export const EditMembersPortal = meta.story({
  parameters: at({ edit: team.id }),
  play: async () => {
    const it = within(await screen.findByRole("dialog", { name: "Edit Team guidelines" }));
    await expect(it.getByRole("radio", { name: /People in this project/ })).toBeChecked();
    await expect(it.getByText("/p/")).toBeInTheDocument();
    await expect(await it.findByText("Not released: visitors see nothing")).toBeInTheDocument();
  },
});

/** Downloads: each preset a checkbox, in the order the portal offers them, summed up on the fold. */
export const Presets = meta.story({
  parameters: at({ edit: verified.id }),
  play: async ({ userEvent }) => {
    const it = within(await screen.findByRole("dialog", { name: "Edit Acme press kit" }));
    await userEvent.click(it.getByText("Downloads"));
    for (const name of ["Story", "PNG", "Original"]) await userEvent.click(it.getByRole("checkbox", { name }));
    await userEvent.click(it.getByRole("checkbox", { name: "Print" }));
    await expect(it.getByText("Web, Social, Story, PNG, Original")).toBeInTheDocument();
    await userEvent.click(it.getByRole("button", { name: /Save/ }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toMatchObject({ presets: ["web", "social", "story", "png", "original"] }));
  },
});

/** A domain of its own, picked from the organization's verified ones (one already on another portal). */
export const AddDomain = meta.story({
  parameters: at({ edit: partners.id }),
  play: async ({ userEvent }) => {
    const it = within(await screen.findByRole("dialog", { name: "Edit Partner hub" }));
    await userEvent.click(it.getByText("Domain"));
    await userEvent.click(it.getByRole("combobox", { name: "Domain of its own" }));
    await expect(await screen.findByRole("option", { name: /brand\.acme\.test/ })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("option", { name: "media.acme.test" }));
    await expect(it.getByText("Leads to media.acme.test")).toBeInTheDocument();
    await userEvent.click(await it.findByRole("button", { name: /Save/ }));
    await waitFor(() => expect(sent.last("PATCH")).toMatchObject({ path: `/api/v1/sites/${partners.id}`, body: { domain: "media.acme.test" } }));
  },
});

/** Its domain added, not seen yet: the records to set at the DNS host, then Check now. */
export const DomainPending = meta.story({
  parameters: at({ edit: pendingDomain.id }),
  beforeEach: ({ msw }) =>
    void msw.use(http.post("/api/v1/sites/:id/domain", () => HttpResponse.json({ data: { ...pendingDomain, domain: { ...pendingDomain.domain!, verified: true } } }))),
  play: async ({ userEvent }) => {
    const it = within(await screen.findByRole("dialog", { name: "Edit Retail partners" }));
    await expect(it.getByText(/retail\.acme\.test → domains\.artbucket\.test/)).toBeInTheDocument();
    await expect(it.getByText("_artbucket-challenge.retail.acme.test")).toBeInTheDocument();
    await userEvent.click(it.getByRole("button", { name: "Check now" }));
    await expect(await it.findByText(/Verified: the portal answers at retail\.acme\.test/)).toBeInTheDocument();
  },
});

/** Verified: the portal answers there, and the slug is only its short link. */
export const DomainVerified = meta.story({
  parameters: at({ edit: verified.id }),
  play: async ({ userEvent }) => {
    const it = within(await screen.findByRole("dialog", { name: "Edit Acme press kit" }));
    await expect(it.getByLabelText("Short link")).toHaveValue("press");
    await userEvent.click(it.getByText("Domain"));
    await expect(it.getByText(/Verified: the portal answers at brand\.acme\.test/)).toBeInTheDocument();
  },
});

/** The records aren't there yet: the server says what it found, and the records stay to copy. */
export const DomainFailing = meta.story({
  parameters: at({ edit: pendingDomain.id }),
  beforeEach: ({ msw }) =>
    void msw.use(
      http.post("/api/v1/sites/:id/domain", () =>
        HttpResponse.json({ error: { code: "invalid", message: "No TXT record at _artbucket-challenge.retail.acme.test yet" } }, { status: 422 }),
      ),
    ),
  play: async ({ userEvent }) => {
    const it = within(await screen.findByRole("dialog", { name: "Edit Retail partners" }));
    await userEvent.click(it.getByRole("button", { name: "Check now" }));
    await expect(await screen.findByText("No TXT record at _artbucket-challenge.retail.acme.test yet")).toBeInTheDocument();
    await expect(it.getByRole("button", { name: "Check now" })).toBeEnabled();
  },
});

/** Offline: its Open until fold opens on the closing date, with Reopen. */
export const EditOffline = meta.story({
  parameters: at({ edit: offline.id }),
  play: async () => {
    const it = within(await screen.findByRole("dialog", { name: "Edit Spring launch 2026" }));
    await expect(it.getByText(/Closed on .* Pick a new date or clear it to reopen\./)).toBeInTheDocument();
    await expect(it.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
  },
});

/** The row's menu: take it offline now, and the row says so at once. */
export const TakeOffline = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for the Acme press kit portal" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Take offline" }));
    await waitFor(() => expect(sent.last("POST")?.path).toBe(`/api/v1/sites/${verified.id}/close`));
    await expect(await screen.findByText("Acme press kit is offline")).toBeInTheDocument();
    await waitFor(() => expect(canvas.getByRole("button", { name: "More for the Acme press kit portal" })).not.toHaveAttribute("aria-expanded", "true"));
    await waitFor(() => expect(document.querySelector("[data-aria-hidden]")).toBeNull());
  },
});

/** Delete, from the row's menu, after a confirm that says what stops working. */
export const Delete = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for the Partner hub portal" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Delete Partner hub?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(sent.last("DELETE")?.path).toBe(`/api/v1/sites/${partners.id}`));
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Partner hub" })).not.toBeInTheDocument());
  },
});

/** Its requests (?open=, from a request's email): someone asking in, approved, denied, and a page's question. */
export const Requests = meta.story({
  parameters: at({ open: partners.id }),
  play: async ({ userEvent }) => {
    const it = within(await screen.findByRole("dialog", { name: "Requests · Partner hub" }));
    await expect(await it.findByText("Lena Park · lena@northwind.test")).toBeInTheDocument();
    await expect(it.getByText("From logo#clear-space")).toBeInTheDocument();
    await userEvent.click(it.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: `/api/v1/sites/${partners.id}/requests/req_lena`, body: { status: "approved" } }));
    await expect(await screen.findByText("lena@northwind.test has access")).toBeInTheDocument();
  },
});

/** Requests that couldn't load: said, with Retry. */
export const RequestsFailed = meta.story({
  parameters: at({ open: partners.id }),
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/sites/:id/requests", () => HttpResponse.json({}, { status: 500 }))),
  play: async () => {
    const it = within(await screen.findByRole("dialog"));
    await expect(await it.findByText("Couldn't load the requests")).toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

/** The portal form on a phone: one column, Save stuck to the bottom. */
export const NewPortalPhone = meta.story({
  parameters: at({ new: "portal" }),
  globals: { viewport: { value: "phone" } },
  play: async () => {
    await expect(await screen.findByRole("dialog", { name: "New portal" })).toBeInTheDocument();
  },
});

export const Dark = meta.story({ globals: { theme: "dark" } });
