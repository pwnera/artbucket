import preview from "#.storybook/preview";
import { expect, screen, waitFor } from "storybook/test";
import { brands, me, members, NOW, recorder, viewer, withMe } from "#.storybook/fixtures/brands";
import { People } from "@/components/settings/access";

const sent = recorder();
const collections = [
  { id: "col_press", name: "Press kit", icon: null, fields: {}, count: 24 },
  { id: "col_legal", name: "Contracts", icon: null, fields: {}, count: 3, private: true },
];
const many = {
  data: [
    ...members.data,
    ...["Margaret Hamilton", "Katherine Johnson", "Radia Perlman", "Barbara Liskov"].map((name, i) => ({
      id: `usr_${i}`,
      name,
      email: `${name.split(" ")[0]!.toLowerCase()}@acme.test`,
      grants: [{ id: `grt_${i}`, resource: "project" as const, resourceId: "prj_acme", projectId: "prj_acme", label: "Acme", scope: "read" as const }],
    })),
  ],
  invitations: members.invitations,
};

const meta = preview.meta({
  title: "App/Features/Settings/People",
  component: People,
  args: { me, members, collections, brands, view: "project" as const, inviting: false },
  argTypes: { view: { control: "inline-radio", options: ["project", "organization"] } },
  decorators: [withMe(me)],
  beforeEach: () => {
    sent.reset();
    // "Expires in 5 days" read against a fixed now; swapped by hand, as a spy on Date.now recurses through the test's instrumentation.
    const real = Date.now;
    Date.now = () => NOW.getTime();
    return () => void (Date.now = real);
  },
});

/** Settings, Members: who can open this project, as what, and why; the invitation waiting. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: /Who can open Acme/ })).toBeInTheDocument();
    await expect(canvas.getByText(/Contributor on Acme · by Ada Lovelace · expires in 5 days/)).toBeInTheDocument();
  },
});

/** Invite someone: email, where, as what; the link comes back to copy, and says it was emailed. */
export const Invite = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/invitations", { url: "https://app.artbucket.test/invite/n7p2w4", emailed: true })),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Invite people" }));
    await userEvent.type(await screen.findByLabelText("Email"), "joan@acme.test");
    await userEvent.click(screen.getByRole("combobox", { name: "As" }));
    await userEvent.click(await screen.findByRole("option", { name: /^Editor/ }));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() =>
      expect(sent.last("POST")).toEqual({ path: "/api/v1/invitations", body: { email: "joan@acme.test", resource: "project", resourceId: "prj_acme", scope: "write" } }),
    );
    await expect(await screen.findByText("Emailed. It stays under Invited until they join.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** Already a member, or a bad address: the API's message, and the dialog stays with what was typed. */
export const InviteFails = meta.story({
  args: { inviting: true },
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/invitations", { code: "conflict", message: "joan@acme.test is already a member" }, 422)),
  play: async ({ userEvent }) => {
    await userEvent.type(await screen.findByLabelText("Email"), "joan@acme.test");
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await expect(await screen.findByText("joan@acme.test is already a member")).toBeInTheDocument();
    await expect(screen.getByLabelText("Email")).toHaveValue("joan@acme.test");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** A role changes at once, and is saved as a grant. */
export const ChangeRole = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/grants", {})),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Grace Hopper's role on Acme" }));
    await userEvent.click(await screen.findByRole("option", { name: /^Admin/ }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/grants", body: { user: "usr_grace", resource: "project", resourceId: "prj_acme", scope: "admin" } }));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  },
});

/** Access to more: a member's grant on a brand or a collection. */
export const GrantMore = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/grants", {})),
  play: async ({ canvas, userEvent }) => {
    const [, linusMore] = canvas.getAllByRole("button", { name: "Access to more" }).slice(1);
    await userEvent.click(linusMore!);
    await userEvent.click(await screen.findByRole("combobox", { name: "On" }));
    await userEvent.click(await screen.findByRole("option", { name: "Northwind (brand)" }));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Give access" }));
    await waitFor(() => expect(sent.last("POST")?.body).toEqual({ user: "usr_linus", resource: "brand", resourceId: "brd_northwind", scope: "read" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** More than five people: a filter, and what matches nothing says so. */
export const Filter = meta.story({
  args: { members: many },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Filter people" }), "zelda");
    await expect(canvas.getByText(/No one matches/)).toBeInTheDocument();
  },
});

/** Only themselves, nobody invited yet. */
export const Empty = meta.story({ args: { members: { data: members.data.slice(0, 1), invitations: [] }, view: "organization" } });

/** Not someone who manages people: read-only, and why. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Only admins can invite people or change their access.")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Invite people" })).toBeDisabled();
  },
});

export const LongNames = meta.story({
  args: {
    members: {
      data: [{ ...members.data[1]!, name: "Grace Brewster Murray Hopper of the Acme International Holdings partner programme", email: "grace.brewster.murray.hopper@partners.acme-international.test" }],
      invitations: [],
    },
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
