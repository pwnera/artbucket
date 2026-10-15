import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { freezeNow, recorder } from "#.storybook/fixtures/brands";
import { docs, external, portal, sitesApi, verified } from "#.storybook/fixtures/sites";
import { BuildSiteDialog } from "@/components/site-deployments";

const sent = recorder();
let uploaded: { query: string; type: string | null; bytes: number } | null = null;
const zip = new File([new Uint8Array([0x50, 0x4b, 3, 4])], "dist.zip", { type: "application/zip" });

/**
 * A built site's panel (BuildSiteDialog): made with a name and a kind, then deployed by dropping a zip of its build
 * (or `artbucket site push`), built from GitHub, opened to whom it should be, and built again on a brand's release.
 * Its deployments list newest first: building, a pull request's preview, live, failed, held for review, and
 * replaced ones to restore. For a brand portal the same panel mounts a build at a path beside its pages.
 */
const meta = preview.meta({
  title: "App/Features/Sites/Deployments",
  component: BuildSiteDialog,
  args: { open: true, site: docs, onClose: fn(), onSaved: fn() },
  beforeEach: ({ msw }) => {
    sent.reset();
    msw.use(
      ...sitesApi(),
      sent.on("post", "/api/v1/sites", portal({ id: "sit_new", kind: "landing", slug: "acme-launch", name: "Acme launch", collections: [], brands: [] })),
      sent.on("patch", "/api/v1/sites/:id", { ...docs, access: "password", password: true }),
      sent.on("post", "/api/v1/sites/:id/deployments/:dep/restore"),
    );
    return freezeNow();
  },
});

/** Every state a deployment is in, the live one's flags under it, and Restore on a replaced one. */
export const Playground = meta.story({
  play: async () => {
    const it = within(await screen.findByRole("dialog", { name: "Acme docs" }));
    const list = within(await it.findByRole("region", { name: "Deployments" }));
    for (const state of ["checking", "preview", "live", "failed", "held", "replaced"]) await expect(await list.findByText(state)).toBeInTheDocument();
    await expect(list.getByRole("link", { name: "pr-12" })).toHaveAttribute("href", "https://pr-12--docs.artbucket.site");
    await expect(list.getByText("No index.html at the zip's root")).toBeInTheDocument();
    await expect(list.getByText(/Uses the 2019 logo/)).toBeInTheDocument();
    await expect(list.getByText(/uses 2 assets, 2 components/)).toBeInTheDocument();
  },
});

/** Roll back: Restore puts a replaced deployment live again, and the list reloads. */
export const Rollback = meta.story({
  play: async ({ userEvent }) => {
    const it = within(await screen.findByRole("dialog"));
    await userEvent.click(await it.findByRole("button", { name: "Restore" }));
    await waitFor(() => expect(sent.last("POST")?.path).toBe("/api/v1/sites/sit_docs/deployments/dep_1/restore"));
    await expect(await screen.findByText("Restored at /")).toBeInTheDocument();
  },
});

/** A zip chosen (or dropped): sent as is to the site's path, then said live with its file count. */
export const Deploy = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.post("/api/v1/sites/:id/deployments", async ({ request }) => {
        uploaded = { query: new URL(request.url).search, type: request.headers.get("Content-Type"), bytes: (await request.arrayBuffer()).byteLength };
        return HttpResponse.json({ data: { state: "live", files: 214 } });
      }),
    ),
  play: async ({ userEvent }) => {
    await screen.findByRole("dialog");
    await userEvent.upload(screen.getByLabelText("A zip of the build"), zip);
    await expect(await screen.findByText("Live at https://docs.artbucket.site")).toBeInTheDocument();
    await expect(screen.getByText("214 files")).toBeInTheDocument();
    await expect(uploaded).toEqual({ query: "?path=%2F&kind=docs", type: "application/zip", bytes: 4 });
  },
});

/** Held: the check found something to look at first, said as a warning, not a failure. */
export const DeployHeld = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(http.post("/api/v1/sites/:id/deployments", () => HttpResponse.json({ data: { state: "held", files: 12, error: "It links a script from another host" } }))),
  play: async ({ userEvent }) => {
    await screen.findByRole("dialog");
    await userEvent.upload(screen.getByLabelText("A zip of the build"), zip);
    await expect(await screen.findByText("Held for review")).toBeInTheDocument();
  },
});

/** Refused: the server's reason, as a toast. */
export const DeployFailed = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.post("/api/v1/sites/:id/deployments", () => HttpResponse.json({ error: { code: "invalid", message: "No index.html at the zip's root" } }, { status: 422 })),
    ),
  play: async ({ userEvent }) => {
    await screen.findByRole("dialog");
    await userEvent.upload(screen.getByLabelText("A zip of the build"), zip);
    await expect(await screen.findByText("No index.html at the zip's root", { selector: "[data-title]" })).toBeInTheDocument();
  },
});

/** Nothing deployed yet. */
export const Empty = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/sites/:id/deployments", () => HttpResponse.json({ data: [] }))),
  play: async () => {
    await expect(await screen.findByText("Nothing deployed yet.")).toBeInTheDocument();
  },
});

/** While the list loads. */
export const Loading = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/sites/:id/deployments", () => new Promise<Response>(() => {}))),
  play: async () => {
    await expect(await screen.findByRole("list", { name: "Loading the deployments" })).toHaveAttribute("aria-busy", "true");
  },
});

/** A new built site: a name (its address follows), a kind; Make the site sends both. */
export const NewSite = meta.story({
  args: { site: null },
  play: async ({ args, userEvent }) => {
    const it = within(await screen.findByRole("dialog", { name: "New built site" }));
    await expect(it.getByRole("button", { name: "Make the site" })).toBeDisabled();
    await userEvent.type(it.getByLabelText("Name"), "Acme launch");
    await expect(it.getByText("Its address: acme-launch")).toBeInTheDocument();
    await userEvent.click(it.getByRole("combobox", { name: "Kind" }));
    await userEvent.click(await screen.findByRole("option", { name: "Landing" }));
    await userEvent.click(await it.findByRole("button", { name: "Make the site" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/sites", body: { name: "Acme launch", slug: "acme-launch", kind: "landing" } }));
    await expect(args.onSaved).toHaveBeenCalled();
    await expect(await screen.findByRole("dialog", { name: "Acme launch" })).toBeInTheDocument();
  },
});

/** Hosted elsewhere: where it lives, and its CI's scans in place of deployments. */
export const External = meta.story({
  args: { site: external },
  play: async () => {
    const it = within(await screen.findByRole("dialog", { name: "Acme shop" }));
    await expect(it.getByText("Recorded from its CI")).toBeInTheDocument();
    await expect(it.getByRole("heading", { name: "Scans" })).toBeInTheDocument();
  },
});

/** A brand portal's builds, mounted at a path beside its pages; who gets in is set on the portal itself. */
export const PortalMount = meta.story({
  args: { site: verified },
  play: async () => {
    const it = within(await screen.findByRole("dialog", { name: "Acme press kit" }));
    await expect(it.getByLabelText("Path")).toHaveValue("/docs");
    await expect(it.getByLabelText("Path")).toBeEnabled();
    await expect(it.queryByRole("region", { name: "Who gets in" })).not.toBeInTheDocument();
  },
});

/** Built from GitHub (SITE_BUILD_URL): connect a repository, or its builds once connected. */
export const BuildFromGitHub = meta.story({
  args: { buildUrl: "https://app.artbucket.test/github/sites/connect?site={site}" },
  play: async () => {
    const it = within(await screen.findByRole("dialog"));
    await expect(it.getByRole("link", { name: "Connect a repository" })).toHaveAttribute("href", "https://app.artbucket.test/github/sites/connect?site=docs");
  },
});

/** Who gets in: a password picked, typed, saved. */
export const WhoGetsIn = meta.story({
  play: async ({ args, userEvent }) => {
    const it = within(within(await screen.findByRole("dialog")).getByRole("region", { name: "Who gets in" }));
    await expect(it.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.click(it.getByRole("combobox", { name: "Who gets in" }));
    await userEvent.click(await screen.findByRole("option", { name: "Whoever has the password" }));
    // The list closes a beat after the pick, giving the dialog back its pointer.
    await waitFor(() => expect(it.getByLabelText("Password")).not.toHaveStyle({ pointerEvents: "none" }));
    await userEvent.type(it.getByLabelText("Password"), "acme-docs");
    await userEvent.click(it.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/sites/sit_docs", body: { access: "password", password: "acme-docs" } }));
    await expect(args.onSaved).toHaveBeenCalled();
  },
});

/** No deploy hook yet: its URL and the brand whose release calls it. */
export const RebuildHook = meta.story({
  args: { site: { ...docs, rebuild: null } },
  play: async ({ userEvent }) => {
    const it = within(within(await screen.findByRole("dialog")).getByRole("region", { name: "Rebuild on release" }));
    await userEvent.type(it.getByLabelText("Deploy hook URL"), "https://api.vercel.com/v1/integrations/deploy/prj_1/abc");
    await waitFor(() => expect(it.getByRole("combobox", { name: "Brand" })).toHaveTextContent("Acme"));
    await userEvent.click(it.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(sent.last("PATCH")?.body).toEqual({ rebuild: { url: "https://api.vercel.com/v1/integrations/deploy/prj_1/abc", brand: "acme" } }),
    );
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" } });
