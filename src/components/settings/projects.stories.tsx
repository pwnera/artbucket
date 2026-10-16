import preview from "#.storybook/preview";
import { getRouter, useSelectedLayoutSegments } from "@storybook/nextjs-vite/navigation.mock";
import { expect, mocked, screen, waitFor, within } from "storybook/test";
import { me, recorder, viewer, withMe } from "#.storybook/fixtures/brands";
import { inApp } from "#.storybook/fixtures/library";
import { ProjectsPanel } from "@/components/settings/panels";
import { SettingsShell } from "@/components/settings/shell";

const sent = recorder();
const projects = [
  { id: "prj_acme", slug: "acme", name: "Acme", scope: "admin" as const },
  { id: "prj_northwind", slug: "northwind", name: "Northwind", scope: "write" as const },
  { id: "prj_archive", slug: "archive-2024", name: "Archive 2024", scope: null },
];

const meta = preview.meta({
  title: "App/Features/Settings/Projects",
  component: ProjectsPanel,
  args: { me, projects },
  decorators: [withMe(me)],
  beforeEach: () => sent.reset(),
});

/** The organization's libraries: the one you are in, and the way into each other. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Here")).toBeInTheDocument();
    await expect(canvas.getAllByRole("button", { name: /^Open/ })).toHaveLength(2);
  },
});

/** Renaming in place: Save sends the new name; Escape leaves it. */
export const Rename = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/projects/:id", {})),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: "Rename" })[1]!);
    const field = canvas.getByRole("textbox", { name: "New name for Northwind" });
    await userEvent.clear(field);
    await userEvent.type(field, "Northwind Retail");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/projects/prj_northwind", body: { name: "Northwind Retail" } }));
  },
});

/** A new project: named in a dialog, then opened. */
export const Make = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/projects", { id: "prj_new", slug: "autumn", name: "Autumn campaign" })),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "New project" }));
    await userEvent.type(await screen.findByLabelText("Name"), "Autumn campaign");
    await userEvent.click(screen.getByRole("button", { name: "Make project" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/projects", body: { name: "Autumn campaign" } }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** Deleting one: its name typed out first. */
export const Delete = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("delete", "/api/v1/projects/:id", {})),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete the project Archive 2024" }));
    await userEvent.type(await screen.findByLabelText(/to confirm/), "Archive 2024");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(sent.last("DELETE")?.path).toBe("/api/v1/projects/prj_archive"));
    await expect(await screen.findByText("Deleted Archive 2024")).toBeInTheDocument();
  },
});

/** The last project can't be deleted: no Delete at all. */
export const OnlyOne = meta.story({
  args: { projects: projects.slice(0, 1) },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: /Delete the project/ })).not.toBeInTheDocument();
  },
});

/** Not an organization admin: read-only, and why. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Only the organization's admins can change this.")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "New project" })).toBeDisabled();
  },
});

export const LongNames = meta.story({
  args: { projects: [...projects.slice(0, 1), { id: "prj_long", slug: "acme-international-holdings-partners", name: "Acme International Holdings Partner Programme Library", scope: "read" as const }] },
});

/** On a phone Rename and Delete fold into one menu, so the name keeps its width. */
export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

/** In the app, as Settings, Organization, Projects shows it: one library per client or team, in the shell. */
export const InSettings = meta.story({
  render: (args) => (
    <SettingsShell>
      <ProjectsPanel {...args} />
    </SettingsShell>
  ),
  decorators: [inApp],
  parameters: { layout: "fullscreen", app: { me: { hub: true } }, nextjs: { navigation: { pathname: "/settings/organization/projects" } } },
  beforeEach: () => void mocked(useSelectedLayoutSegments).mockReturnValue(["(sections)", "organization", "projects"]),
  play: async ({ canvas }) => {
    const nav = canvas.getByRole("navigation", { name: "Settings" });
    await expect(within(nav).getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "page");
    await expect(canvas.getByText("Northwind")).toBeInTheDocument();
  },
});
