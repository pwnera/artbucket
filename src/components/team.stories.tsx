import preview from "#.storybook/preview";
import { NOW, me, members, viewer, withMe } from "#.storybook/fixtures/brands";
import { inApp, shareLink } from "#.storybook/fixtures/library";
import { delay, http, HttpResponse } from "msw";
import { expect, screen, waitFor, within } from "storybook/test";
import type { AuditPage } from "@/components/settings/access";
import { Team } from "@/components/team";

/** Every write the page sent, for a play test to read: reset before each story. */
let sent: { method: string; url: string; body: unknown }[] = [];
const take =
  (status = 200, data: unknown = {}) =>
  async ({ request }: { request: Request }) => {
    sent.push({ method: request.method, url: new URL(request.url).pathname, body: request.method === "DELETE" ? null : await request.json().catch(() => null) });
    await delay(50);
    return status === 200 ? HttpResponse.json({ data }) : HttpResponse.json({ error: { code: "invalid", message: "An organization keeps at least one admin" } }, { status });
  };
const last = () => sent.at(-1);
/** A select or dialog just closed hides the page from assistive tech until its exit ends: wait it out before querying or axe. */
const settled = () => waitFor(() => expect(document.querySelector("[data-aria-hidden]")).toBeNull());

const audit: AuditPage = {
  data: [
    { id: "aud_1", at: new Date(NOW.getTime() - 3_600_000).toISOString(), actor: "Ada Lovelace", action: "share.created", target: "Press kit", detail: null, ip: null },
    { id: "aud_2", at: new Date(NOW.getTime() - 86_400_000).toISOString(), actor: "Ada Lovelace", action: "grant.set", target: "Grace Hopper", detail: { scope: "write" }, ip: null },
  ],
  next: null,
};

const meta = preview.meta({
  title: "App/Features/Settings/Team",
  component: Team,
  args: { tab: "people", members, shares: [shareLink()], audit },
  // Inner first: Ada (an organization admin) looking, inside the app's shell.
  decorators: [withMe(me), inApp],
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/team" } } },
  beforeEach: ({ msw }) => {
    sent = [];
    msw.use(
      http.post("/api/v1/invitations", take(200, { url: "https://app.artbucket.test/invite/n7p2w4", emailed: true })),
      http.post("/api/v1/grants", take()),
      http.delete("/api/v1/grants/:id", take()),
    );
    // "Expires in 5 days" is read against a fixed now; swapped by hand, as a spy on Date.now recurses through the test's instrumentation.
    const real = Date.now;
    Date.now = () => NOW.getTime();
    return () => void (Date.now = real);
  },
});

/** The organization's people with what each may do, the invitation waiting, and the tabs for links and the audit log. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Team · Acme" })).toBeInTheDocument();
    await expect(canvas.getByRole("tab", { name: "People 3" })).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByText("sam@acme.test")).toBeInTheDocument();
    await expect(canvas.getByText(/Contributor on Acme · by Ada Lovelace · expires in 5 days/)).toBeInTheDocument();
  },
});

/** Invite people: email, where, as what; the link comes back to copy, and says it was emailed. */
export const Invite = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Invite people" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite someone" });
    await userEvent.type(within(dialog).getByLabelText("Email"), "lin@acme.test");
    await userEvent.click(within(dialog).getByRole("combobox", { name: "As" }));
    await userEvent.click(await screen.findByRole("option", { name: /^Editor/ }));
    await userEvent.click(await within(dialog).findByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(last()).toEqual({ method: "POST", url: "/api/v1/invitations", body: { email: "lin@acme.test", resource: "project", resourceId: "prj_acme", scope: "write" } }));
    await expect(await within(dialog).findByText("https://app.artbucket.test/invite/n7p2w4")).toBeInTheDocument();
    await expect(within(dialog).getByText(/Emailed/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** A role changed in place: the grant is POSTed again with the new scope. */
export const ChangeRole = meta.story({
  play: async ({ canvas, userEvent }) => {
    const role = canvas.getByRole("combobox", { name: "Grace Hopper's role on Acme" });
    await userEvent.click(role);
    await userEvent.click(await screen.findByRole("option", { name: /^Viewer/ }));
    await waitFor(() => expect(last()).toEqual({ method: "POST", url: "/api/v1/grants", body: { user: "usr_grace", resource: "project", resourceId: "prj_acme", scope: "read" } }));
    await expect(role).toHaveTextContent("Viewer");
    await settled();
  },
});

/** Removing someone's access: a DELETE of the grant, then a toast to undo it. */
export const RemoveAccess = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove Linus Nakamura's access to Press kit" }));
    await waitFor(() => expect(last()).toEqual({ method: "DELETE", url: "/api/v1/grants/grt_linus", body: null }));
    await expect(await screen.findByText("Removed Linus Nakamura's access to Press kit")).toBeInTheDocument();
  },
});

/** A refused change (422) says why, and the role goes back to what it was. */
export const ChangeRefused = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.post("/api/v1/grants", take(422))),
  play: async ({ canvas, userEvent }) => {
    const role = canvas.getByRole("combobox", { name: "Grace Hopper's role on Acme" });
    await userEvent.click(role);
    await userEvent.click(await screen.findByRole("option", { name: /^Viewer/ }));
    await expect(await screen.findByText("An organization keeps at least one admin")).toBeInTheDocument();
    await waitFor(() => expect(role).toHaveTextContent("Editor"));
    await settled();
  },
});

/** Lowering your own admin asks first: you might not get it back yourself. */
export const OwnAdmin = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove Ada Lovelace's access to Acme" }));
    await expect(await screen.findByRole("alertdialog", { name: "Remove your own admin access to Acme?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await expect(sent).toEqual([]);
  },
});

/** Opened on the Links tab (`?tab=sharing`). */
export const Links = meta.story({
  args: { tab: "sharing" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tab", { name: "Links 1" })).toHaveAttribute("aria-selected", "true");
    await expect(await canvas.findByText("Press kit for Northwind")).toBeInTheDocument();
  },
});

/** Opened on the audit log (`?tab=audit`). */
export const AuditLog = meta.story({ args: { tab: "audit" } });

/** No one invited, and nothing in the audit log yet. */
export const Empty = meta.story({
  args: { members: { data: members.data.slice(0, 1), invitations: [] }, shares: [], audit: { data: [], next: null } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No invitations waiting.")).toBeInTheDocument();
  },
});

/** A viewer: every role is a badge, nothing to change, and no way to Settings' members. */
export const Viewer = meta.story({
  args: { shares: null, audit: null },
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("combobox")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Project members in Settings" })).not.toBeInTheDocument();
  },
});

/** Long names and emails truncate on their line. */
export const LongNames = meta.story({
  args: {
    members: {
      ...members,
      data: [
        ...members.data,
        {
          id: "usr_long",
          name: "Maximiliana Alexandrovna Featherstonehaugh-Montgomery",
          email: "maximiliana.featherstonehaugh-montgomery@international-partners.northwind.test",
          grants: [{ id: "grt_long", resource: "collection", resourceId: "col_launch", projectId: "prj_acme", label: "Spring launch 2026 regional partner assets", scope: "propose" }],
        },
      ],
    },
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
