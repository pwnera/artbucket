import preview from "#.storybook/preview";
import { headAcme, headNorthwind } from "#.storybook/fixtures/brand-pages";
import { as, freezeNow, me, recorder, source, withMe } from "#.storybook/fixtures/brands";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { http, HttpResponse } from "msw";
import { expect, screen, waitFor, within } from "storybook/test";
import { BrandSettings } from "@/components/brand-settings";

const sent = recorder();
/** A repository linked by hand (`artbucket brand push`), not by the Git integration: disconnected here. */
const byHand = { source: { ...source.source!, pending: false }, connect: null };

/**
 * A brand's Settings tab: its name, address and domain, private or open to the project, the default or not, the
 * repository its files also live in, and deleting it (asked first). Each form saves on its own with PATCH
 * /api/v1/brands/{slug}, and says Saved beside its button.
 */
const meta = preview.meta({
  title: "App/Features/Brands/Settings",
  component: BrandSettings,
  args: { brand: headNorthwind, source },
  decorators: [withMe(me), (Story) => <div className="max-w-3xl">{Story()}</div>],
  beforeEach: ({ msw }) => {
    sent.reset();
    msw.use(
      sent.on("patch", "/api/v1/brands/northwind", { slug: "northwind", domain: null }),
      sent.on("delete", "/api/v1/brands/northwind", {}),
      sent.on("delete", "/api/v1/brands/northwind/source", {}),
    );
    // "synced 1 day ago" is read against the fixtures' day.
    return freezeNow();
  },
});

/** Northwind: private, not the default, kept in a repository through the Git integration. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Name" })).toHaveValue("Northwind");
    // Saved as it is left: no button to press.
    await expect(canvas.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
    await expect(canvas.getByText(/main, brand, 14 files, synced yesterday, with changes to bring in/)).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Manage" })).toHaveAttribute("href", source.connect!);
  },
});

/** Rename: typed and left (Enter leaves it too), PATCH the name, Saved beside it, the page read again. */
export const Rename = meta.story({
  play: async ({ canvas, userEvent }) => {
    const name = canvas.getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Northwind Coffee{Enter}");
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/brands/northwind", body: { name: "Northwind Coffee" } }));
    await expect(await canvas.findByText("Saved")).toBeInTheDocument();
    await expect(getRouter().refresh).toHaveBeenCalled();
  },
});

/** A new address, typed in lower case: the tab moves to it, since the old one stops working. */
export const ChangeTheAddress = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/brands/northwind", { slug: "northwind-coffee", domain: null })),
  play: async ({ canvas, userEvent }) => {
    const slug = canvas.getByRole("textbox", { name: /Address/ });
    await userEvent.clear(slug);
    await userEvent.type(slug, "Northwind-Coffee");
    await expect(slug).toHaveValue("northwind-coffee");
    await userEvent.click(canvas.getByRole("button", { name: "Change" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ slug: "northwind-coffee" }));
    await waitFor(() => expect(getRouter().replace).toHaveBeenCalledWith("/brands/northwind-coffee/settings"));
  },
});

/** The brand's own website, kept as the server keeps it (acme.test for https://www.acme.test/); cleared, it is null. */
export const Domain = meta.story({
  args: { brand: headAcme },
  beforeEach: ({ msw }) =>
    void msw.use(
      // The server keeps the host alone, without www.
      http.patch("/api/v1/brands/acme", async ({ request }) => {
        const { domain } = (await request.json()) as { domain: string | null };
        sent.calls.push({ method: "PATCH", path: "/api/v1/brands/acme", body: { domain } });
        return HttpResponse.json({ data: { slug: "acme", domain: domain && new URL(domain.includes("//") ? domain : `https://${domain}`).hostname.replace(/^www\./, "") } });
      }),
    ),
  play: async ({ canvas, userEvent }) => {
    const domain = canvas.getByRole("textbox", { name: /Domain/ });
    await userEvent.clear(domain);
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/brands/acme", body: { domain: null } }));
    await userEvent.type(domain, "https://www.acme.test/{Enter}");
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ domain: "https://www.acme.test/" }));
    await waitFor(() => expect(domain).toHaveValue("acme.test"));
  },
});

/** Limited to people given access, or open to the whole project again. */
export const OpenToTheProject = meta.story({
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Only people given access")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Open to the project" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ private: false }));
    await expect(await screen.findByText("Northwind is the project's again")).toBeInTheDocument();
  },
});

/** The default brand is what agents and the API read when no brand is named. */
export const MakeDefault = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Make default" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ default: true }));
    await expect(await screen.findByText("Northwind is the default brand")).toBeInTheDocument();
  },
});

/** Delete asks first; Cancel leaves it. Confirmed: DELETE, then the Brands page. */
export const Delete = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete brand" }));
    let ask = await screen.findByRole("alertdialog", { name: "Delete Northwind?" });
    await expect(ask).toHaveAccessibleDescription("Its rules, pages and history are deleted. This can't be undone.");
    await userEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await expect(sent.last("DELETE")).toBeUndefined();
    await userEvent.click(canvas.getByRole("button", { name: "Delete brand" }));
    ask = await screen.findByRole("alertdialog", { name: "Delete Northwind?" });
    await userEvent.click(within(ask).getByRole("button", { name: "Delete brand" }));
    await waitFor(() => expect(sent.last("DELETE")).toEqual({ path: "/api/v1/brands/northwind", body: null }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/brands"));
    await expect(await screen.findByText("Deleted Northwind")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  },
});

/** Refused: the API's words, and the dialog stays for another try. */
export const DeleteFails = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("delete", "/api/v1/brands/northwind", { code: "conflict", message: "Two portals still show Northwind" }, 409)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete brand" }));
    const ask = await screen.findByRole("alertdialog", { name: "Delete Northwind?" });
    await userEvent.click(within(ask).getByRole("button", { name: "Delete brand" }));
    await expect(await screen.findByText("Two portals still show Northwind")).toBeInTheDocument();
    await expect(ask).toBeInTheDocument();
    await expect(getRouter().push).not.toHaveBeenCalled();
    await userEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  },
});

/** The default brand (Acme): no Make default, and it can't be deleted. */
export const TheDefault = meta.story({
  args: { brand: headAcme },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Default brand")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Make default" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Delete brand" })).not.toBeInTheDocument();
  },
});

/** A Contributor, who may edit but not delete. */
export const Contributor = meta.story({
  decorators: [withMe(as("propose"))],
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Delete brand" })).not.toBeInTheDocument();
  },
});

/** A repository linked by hand: Disconnect, asked first, leaves the repository as it is. */
export const Disconnect = meta.story({
  args: { source: byHand },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Disconnect" }));
    const ask = await screen.findByRole("alertdialog", { name: "Disconnect the repository?" });
    await userEvent.click(within(ask).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(sent.last("DELETE")).toEqual({ path: "/api/v1/brands/northwind/source", body: null }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  },
});

/** Not in a repository, where the server has the Git integration: Connect a repository. */
export const NotConnected = meta.story({
  args: { source: { source: null, connect: source.connect } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Connect a repository" })).toHaveAttribute("href", source.connect!);
  },
});

/** Not in a repository, and no integration: the API's export and import, behind the (i). */
export const NoIntegration = meta.story({
  args: { source: { source: null, connect: null } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Not connected")).toBeInTheDocument();
  },
});

/** The source couldn't be read: no Repository at all. */
export const NoRepository = meta.story({
  args: { source: null },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("heading", { name: "Repository" })).not.toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" } });
