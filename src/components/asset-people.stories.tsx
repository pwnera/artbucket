import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, screen, waitFor } from "storybook/test";
import { as, collections, members } from "#.storybook/fixtures/library";
import { AssetPeople } from "@/components/asset-people";

const sent: { method: string; url: string; body: unknown }[] = [];

/**
 * Who sees a private asset (AssetPeople): people added to it, people added to one of its collections, and the
 * project's admins. A project admin adds and removes people here; everyone else is told who can.
 */
const meta = preview.meta({
  title: "App/Features/Library/Asset people",
  component: AssetPeople,
  decorators: [as, (Story) => <div className="w-96">{Story()}</div>],
  args: { asset: { id: "ast_hero", collections: ["col_campaign"] }, collections },
  beforeEach: ({ msw }) => {
    sent.length = 0;
    msw.use(
      http.get("/api/v1/members", () => HttpResponse.json({ data: members, invitations: [] })),
      http.all("/api/v1/grants*", async ({ request }) => {
        sent.push({ method: request.method, url: new URL(request.url).pathname, body: await request.json().catch(() => null) });
        return HttpResponse.json({ data: {} });
      }),
    );
  },
});

/** Added, through a collection, admins; and Add a person. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Omar Haddad")).toBeInTheDocument();
    await expect(canvas.getByText("Viewer via Autumn campaign")).toBeInTheDocument();
    await expect(canvas.getByText("Admins see it too: Dana Reyes.")).toBeInTheDocument();
  },
});

/** Change a role, then remove someone: each a grant, with Undo for the removal. */
export const ChangeAndRemove = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("combobox", { name: "Omar Haddad's role on this asset" }));
    await userEvent.click(await screen.findByRole("option", { name: "Viewer" }));
    await waitFor(() => expect(sent[0]).toEqual({ method: "POST", url: "/api/v1/grants", body: { user: "usr_omar", resource: "asset", resourceId: "ast_hero", scope: "read" } }));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await userEvent.click(await canvas.findByRole("button", { name: "Remove Omar Haddad" }));
    await waitFor(() => expect(sent[1]).toEqual({ method: "DELETE", url: "/api/v1/grants/g2", body: null }));
    await expect(await screen.findByText("Removed Omar Haddad from this asset")).toBeInTheDocument();
  },
});

/** Not a project admin: who can add people. */
export const NotAdmin = meta.story({
  parameters: { app: { scope: "write" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("A project admin can add people to it.")).toBeInTheDocument();
  },
});

/** The people list couldn't load. */
export const Failed = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/members", () => new HttpResponse(null, { status: 500 }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Couldn't load who sees it.");
  },
});

/** Everyone in the project is listed already: Invite someone instead. */
export const EveryoneAdded = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/members", () => HttpResponse.json({ data: members.slice(0, 3), invitations: [] }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("link", { name: "Invite someone" })).toHaveAttribute("href", "/settings/project/people?tab=people&invite");
  },
});
