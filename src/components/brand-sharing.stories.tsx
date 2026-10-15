import preview from "#.storybook/preview";
import { headAcme, hub, portals } from "#.storybook/fixtures/brand-pages";
import { assetFiles, recorder, release, status } from "#.storybook/fixtures/brands";
import { inApp } from "#.storybook/fixtures/library";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { http, HttpResponse } from "msw";
import { expect, screen, waitFor, within } from "storybook/test";
import { BrandSharing } from "@/components/brand-sharing";

const sent = recorder();
const PUBLIC = hub({ visibility: "public", chosen: true });
/** BrandHub's README badge, drawn here rather than fetched. */
const BADGE = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20"><rect width="120" height="20" rx="3" fill="#2f62ff"/><text x="8" y="14" fill="#fff" font-family="sans-serif" font-size="11">brand @12</text></svg>`;

/** The portal row named `name`. */
const row = async (name: string) => within((await screen.findByRole("button", { name })).closest("li")!);

/**
 * A brand's Sharing tab: who reads it outside the team and where. BrandHub (public or private, PATCH .../hub, asked
 * first before it goes public), its README badge and the brand.json for its own site, the portals showing it and the
 * one BrandHub links, its templates, and the addresses agents and code read it from.
 */
const meta = preview.meta({
  title: "App/Features/Brands/Sharing",
  component: BrandSharing,
  args: { brand: headAcme, origin: "https://app.artbucket.test", hub: PUBLIC, portals, portalDomain: "artbucket.test", release, files: status.files! },
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div className="mx-auto max-w-3xl p-6">{Story()}</div>, inApp],
  beforeEach: ({ msw }) => {
    sent.reset();
    msw.use(
      assetFiles,
      sent.on("patch", "/api/v1/brands/acme/hub", PUBLIC),
      http.get("https://hub.artbucket.test/*", () => new HttpResponse(BADGE, { headers: { "Content-Type": "image/svg+xml" } })),
    );
  },
});

/** Acme, public on BrandHub: its badge and brand.json, three portals, the one BrandHub links marked. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Public: anyone and any agent reads its latest release.")).toBeInTheDocument();
    await expect(canvas.getByRole("img", { name: "The brand's README badge" })).toBeInTheDocument();
    await expect(canvas.getByText(/On acme.test, at/)).toBeInTheDocument();
    const acme = await row("Acme brand portal");
    await expect(acme.getByText("BrandHub links it")).toBeInTheDocument();
    await expect((await row("Partner portal")).getByRole("link", { name: /2 waiting/ })).toHaveAttribute("href", "/sites?open=prt_partners");
    await expect((await row("Team handbook")).getByText("Offline")).toBeInTheDocument();
  },
});

/** Private: Make public asks first, then PATCHes the visibility; what comes back is shown at once. */
export const MakePublic = meta.story({
  args: { hub: hub() },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Private: only people in this project, signed in.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Make public" }));
    const ask = await screen.findByRole("alertdialog", { name: "Make Acme public?" });
    await userEvent.click(within(ask).getByRole("button", { name: "Make public" }));
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/brands/acme/hub", body: { visibility: "public" } }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await expect(await canvas.findByText("Public: anyone and any agent reads its latest release.")).toBeInTheDocument();
    await expect(getRouter().refresh).toHaveBeenCalled();
  },
});

/** Make private takes effect at once. */
export const MakePrivate = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/brands/acme/hub", hub())),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Make private" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ visibility: "private" }));
    await expect(await canvas.findByRole("button", { name: "Make public" })).toBeInTheDocument();
  },
});

/** Never released: nothing on BrandHub to make public, nor to see. */
export const NeverReleased = meta.story({
  args: { hub: hub({ published: null, portal: null }), release: null, portals: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Make public" })).toBeDisabled();
    await expect(canvas.queryByRole("link", { name: /See it on BrandHub/ })).not.toBeInTheDocument();
    await expect(canvas.queryByText("Share card and templates")).not.toBeInTheDocument();
  },
});

/** The portal BrandHub links as the guidelines: picked on its row, or left to BrandHub (its first public one). */
export const PickTheLinkedPortal = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.click((await row("Partner portal")).getByRole("button", { name: "Link from BrandHub" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ portal: "partners" }));
    await userEvent.click((await row("Acme brand portal")).getByRole("button", { name: "Let BrandHub pick" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ portal: null }));
  },
});

/** No portal shows it yet: New portal, with the brand picked. */
export const NoPortalYet = meta.story({
  args: { portals: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No portal shows this brand yet.")).toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Manage" })).not.toBeInTheDocument();
  },
});

/** New portal opens the Portals page's dialog here, showing this brand. */
export const NewPortal = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "New portal" }));
    const dialog = await screen.findByRole("dialog");
    await expect(within(dialog).getAllByText("Acme").length).toBeGreaterThan(0);
    // The first Esc leaves the name field, the second closes.
    await userEvent.keyboard("{Escape}{Escape}");
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  },
});

/** Someone who may not manage portals: no Sites section. */
export const CannotManagePortals = meta.story({
  args: { portals: null },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("heading", { name: "Sites" })).not.toBeInTheDocument();
  },
});

/** Someone who reads: where it is shared, without the buttons that change it. */
export const Viewer = meta.story({
  parameters: { app: { scope: "read" } },
  args: { portals: null },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: /Make p/ })).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /See it on BrandHub/ })).toHaveAttribute("href", "https://hub.artbucket.test/acme/acme");
  },
});

/** No BrandHub on this server: the portals and the addresses alone. */
export const NoBrandHub = meta.story({
  args: { hub: null },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("heading", { name: "BrandHub" })).not.toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" } });
