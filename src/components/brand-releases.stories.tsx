import preview from "#.storybook/preview";
import { acme, emptyStatus, freezeNow, me, northwind, rules, status, updates, versions, viewer, withMe } from "#.storybook/fixtures/brands";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { http, HttpResponse } from "msw";
import { expect, waitFor } from "storybook/test";
import { NewRelease, ReleaseList } from "@/components/brand-releases";

const meta = preview.meta({
  title: "App/Features/Brands/Releases",
  component: ReleaseList,
  args: { slug: "acme", target: acme, updates, pending: true },
  decorators: [withMe(me)],
  beforeEach: freezeNow,
});

/** The Releases tab: what readers got, newest first, and Release while there are changes since. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Unreleased changes since @12")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Release" })).toHaveAttribute("href", "/brands/acme/releases/new");
    await expect(canvas.getByText("Ada Lovelace, 2 days ago")).toBeInTheDocument();
    await expect(canvas.getByText("1 new rule, 1 rule changed, 1 page edited")).toBeInTheDocument();
  },
});

/** Readers see the brand as it stands: no banner. */
export const UpToDate = meta.story({
  args: { pending: false },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link", { name: "Release" })).not.toBeInTheDocument();
  },
});

/** Never released (Northwind): what a release is for, and the first one. */
export const NeverReleased = meta.story({
  args: { slug: "northwind", target: northwind, updates: [], pending: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Not released yet")).toBeInTheDocument();
  },
});

/** A viewer: the history, without Release. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link", { name: "Release" })).not.toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

// The release page: the draft (@13) against the live release (@12), and the publish.
const base = "/api/v1/brands/acme";
const snap = (rs: typeof rules) => ({ rules: rs.map(({ key, context, type, value, usage, assets }, position) => ({ key, context, type, value, usage, assets, position })), pages: null });
let body: unknown;
const history = [
  http.get(`${base}/versions`, () => HttpResponse.json({ data: versions })),
  http.get(`${base}/versions/12`, () => HttpResponse.json({ data: snap(rules.filter((r) => r.key !== "color.accent")) })),
  http.get(`${base}/versions/13`, () => HttpResponse.json({ data: snap(rules) })),
];

/** Publish a release, as a page: a note, what changes since @12, and Release @13. */
export const NewReleasePage = meta.story({
  render: () => <NewRelease slug="acme" target={acme} name="Acme" status={status} comments={2} />,
  beforeEach: ({ msw }) => {
    body = undefined;
    msw.use(
      ...history,
      http.post(`${base}/publish`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { number: 13, portals: status.portals } });
      }),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("What changes since @12")).toBeInTheDocument();
    await expect(await canvas.findByText("color.accent")).toBeInTheDocument();
    await expect(canvas.getByText("2 open comments on these pages.")).toBeInTheDocument();
    await userEvent.type(canvas.getByLabelText("Note for readers"), "Signal orange for alerts.");
    await userEvent.click(canvas.getByRole("button", { name: "Release @13" }));
    await waitFor(() => expect(body).toEqual({ note: "Signal orange for alerts." }));
    await expect(await canvas.findByRole("heading", { name: "Released @13" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await expect(getRouter().push).toHaveBeenCalledWith("/brands/acme/releases");
  },
});

/** The publish refused: the API's words under the form, which stays for another try. */
export const NewReleaseFails = meta.story({
  render: () => <NewRelease slug="acme" target={acme} name="Acme" status={status} comments={0} />,
  beforeEach: ({ msw }) =>
    void msw.use(...history, http.post(`${base}/publish`, () => HttpResponse.json({ error: { code: "invalid", message: "A release is already on its way" } }, { status: 422 }))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Release @13" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("A release is already on its way");
    await expect(canvas.getByRole("button", { name: "Release @13" })).toBeEnabled();
  },
});

/** Cancel goes back to the brand. */
export const NewReleaseCancel = meta.story({
  render: () => <NewRelease slug="acme" target={acme} name="Acme" status={status} comments={0} />,
  beforeEach: ({ msw }) => void msw.use(...history),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Cancel" }));
    await expect(getRouter().push).toHaveBeenCalledWith("/brands/acme");
  },
});

/** The first release of a brand only the team reads: who should see it, asked in the same step. */
export const FirstRelease = meta.story({
  render: () => <NewRelease slug="northwind" target={northwind} name="Northwind" status={{ ...emptyStatus, portals: [] }} comments={0} />,
  beforeEach: ({ msw }) => void msw.use(http.get("/api/v1/brands/northwind/versions", () => HttpResponse.json({ data: [] }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("First release: every page and rule.")).toBeInTheDocument();
    await expect(canvas.getByRole("group", { name: "Who should see it" })).toBeInTheDocument();
  },
});

/** While the draft is read: lines held in place. */
export const NewReleaseLoading = meta.story({
  render: () => <NewRelease slug="acme" target={acme} name="Acme" status={status} comments={0} />,
  beforeEach: ({ msw }) => void msw.use(http.get(`${base}/versions`, () => new Promise<Response>(() => {}))),
});
