import preview from "#.storybook/preview";
import { useState } from "react";
import { expect, screen, waitFor } from "storybook/test";
import { me, recorder, viewer, withMe } from "#.storybook/fixtures/brands";
import { Button } from "@/components/ui/button";
import { DeleteOrganization, Group, LoadFailed, NameForm, SavedMark } from "@/components/settings/panels";

const sent = recorder();

const meta = preview.meta({
  title: "App/Features/Settings/General",
  component: NameForm,
  args: { what: "organization", url: "/api/v1/organizations/org_acme", name: "Acme" },
  argTypes: { what: { control: "inline-radio", options: ["organization", "project"] } },
  decorators: [withMe(me)],
  beforeEach: () => sent.reset(),
});

/** A name, saved by PATCH: Save waits for a change, and says Saved beside itself. */
export const Playground = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/organizations/:id", {})),
  play: async ({ canvas, userEvent }) => {
    const save = canvas.getByRole("button", { name: "Save" });
    await expect(save).toBeDisabled();
    const name = canvas.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Acme Studio");
    await userEvent.click(save);
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/organizations/org_acme", body: { name: "Acme Studio" } }));
    await expect(await canvas.findByText("Saved")).toBeInTheDocument();
  },
});

/** Refused: the API's message as a toast, and the name stays to fix. */
export const SaveFails = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/organizations/:id", { code: "invalid", message: "That name is taken" }, 422)),
  play: async ({ canvas, userEvent }) => {
    const name = canvas.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Northwind");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await screen.findByText("That name is taken")).toBeInTheDocument();
    await expect(name).toHaveValue("Northwind");
  },
});

/** The project's name: its admins' to change. */
export const ProjectName = meta.story({ args: { what: "project", url: "/api/v1/projects/prj_acme", name: "Acme" } });

/** Not an admin: read-only, and why. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Only the organization's admins can change this.")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Name")).toBeDisabled();
  },
});

/** The organization's page under its name: deleting it, its name typed out first. */
export const DeleteTheOrganization = meta.story({
  render: () => <DeleteOrganization me={me} />,
  beforeEach: ({ msw }) => void msw.use(sent.on("delete", "/api/v1/organizations/:id", {})),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete this organization" }));
    const confirm = await screen.findByRole("button", { name: "Delete" });
    await expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/to confirm/), "Acme");
    await userEvent.click(confirm);
    await waitFor(() => expect(sent.last("DELETE")).toEqual({ path: "/api/v1/organizations/org_acme", body: null }));
    await expect(await screen.findByText("Deleted Acme")).toBeInTheDocument();
  },
});

/** A section whose data didn't load: say so, and offer to try again. */
export const Failed = meta.story({ render: () => <LoadFailed /> });

/** The unit every panel is made of; danger sets apart what can't be undone. */
export const Groups = meta.story({
  render: () => (
    <div className="max-w-xl space-y-6">
      <Group title="Name" description="What people see the organization called." info="In the sidebar, in invitations, on share links.">
        <p className="text-sm">Controls go here.</p>
      </Group>
      <Group title="Delete the organization" tone="danger" description="Its projects and everything in them go at once.">
        <Button variant="destructive" className="w-fit">
          Delete
        </Button>
      </Group>
    </div>
  ),
});

/** "Saved" beside what saved, for a moment, read out once. */
export const Saved = meta.story({
  render: function Render() {
    const [at, setAt] = useState(0);
    return (
      <div className="flex items-center gap-2">
        <Button onClick={() => setAt(Date.now())}>Save</Button>
        <SavedMark at={at} />
      </div>
    );
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText("Saved")).toBeInTheDocument();
  },
});
