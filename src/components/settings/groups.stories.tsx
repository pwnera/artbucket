import preview from "#.storybook/preview";
import { expect, screen, waitFor } from "storybook/test";
import { groups, me, members, recorder, viewer, withMe } from "#.storybook/fixtures/brands";
import { GroupsPanel } from "@/components/settings/groups";

const sent = recorder();
const people = members.data.map(({ id, name, email }) => ({ id, name, email }));
const places = [
  { resource: "organization" as const, resourceId: "org_acme", label: "Acme (every project)" },
  { resource: "project" as const, resourceId: "prj_acme", label: "Acme" },
  { resource: "project" as const, resourceId: "prj_northwind", label: "Northwind" },
];

const meta = preview.meta({
  title: "App/Features/Settings/Groups",
  component: GroupsPanel,
  args: { groups, people, places },
  decorators: [withMe(me)],
  beforeEach: () => sent.reset(),
});

/** The brand team (editors on Acme) and legal, no role yet. */
export const Playground = meta.story({});

/** None yet: say what a group is for, and make the first. */
export const Empty = meta.story({
  args: { groups: [] },
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/groups", { id: "grp_new", name: "Agency", members: [], grants: [] })),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText(/No groups yet/)).toBeInTheDocument();
    await userEvent.type(canvas.getByRole("textbox", { name: "New group's name" }), "Agency");
    await userEvent.click(canvas.getByRole("button", { name: "New group" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/groups", body: { name: "Agency" } }));
    await waitFor(() => expect(canvas.getByRole("textbox", { name: "New group's name" })).toHaveValue(""));
  },
});

/** A name already taken: the API's message, and the name stays to fix. */
export const CreateFails = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/groups", { code: "conflict", message: "There is already a group called Legal" }, 422)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "New group's name" }), "Legal");
    await userEvent.click(canvas.getByRole("button", { name: "New group" }));
    await expect(await screen.findByText("There is already a group called Legal")).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "New group's name" })).toHaveValue("Legal");
  },
});

/** Adding someone, taking someone out, and giving the group a role. */
export const Members = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/groups/:id/members", {}), sent.on("post", "/api/v1/grants", {})),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Add someone to Legal" }));
    await userEvent.click(await screen.findByRole("option", { name: "Ada Lovelace" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/groups/grp_legal/members", body: { add: ["usr_ada"] } }));
    // The list closes before the page behind it can be reached again.
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole("button", { name: "Take Grace Hopper out of Brand team" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/groups/grp_brand/members", body: { remove: ["usr_grace"] } }));
    const [, legalGive] = canvas.getAllByRole("button", { name: "Give access" });
    await userEvent.click(legalGive!);
    await waitFor(() =>
      expect(sent.last("POST")).toEqual({ path: "/api/v1/grants", body: { group: "grp_legal", resource: "organization", resourceId: "org_acme", scope: "read" } }),
    );
  },
});

/** Deleting a group asks first: its members lose what it gave them. */
export const Delete = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("delete", "/api/v1/groups/:id", { deleted: true })),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete Legal" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(sent.last("DELETE")).toEqual({ path: "/api/v1/groups/grp_legal", body: null }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  },
});

/** Not an organization admin: read-only, and why. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Only the organization's admins can change this.")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "New group" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Delete Legal" })).toBeDisabled();
  },
});

export const LongNames = meta.story({
  args: {
    groups: [{ ...groups[0]!, name: "Acme International Holdings partner programme reviewers, EMEA and APAC" }],
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
