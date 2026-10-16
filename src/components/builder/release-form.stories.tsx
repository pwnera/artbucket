import preview from "#.storybook/preview";
import { acme, emptyStatus, me, status, versions, viewer, viewRules, withMe } from "#.storybook/fixtures/brands";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, waitFor } from "storybook/test";
import { ReleaseForm, type ReleaseHost } from "@/components/builder/release-form";
import type { Status } from "@/components/builder/use-status";
import type { SnapRule } from "@/lib/history";
import { sendResult } from "@/lib/send";

const transport: ReleaseHost["transport"] = (method, url, body) => sendResult(method, url, body, { quiet: true });

const host = (o: Partial<ReleaseHost> = {}): ReleaseHost => ({
  brand: "acme",
  target: acme,
  name: "Acme",
  transport,
  status,
  comments: { open: 0, review: "/brands/acme/guidelines?comments=1" },
  released: fn(),
  ...o,
});

/** @12 as released, and the draft @13: Acme Blue darker, Signal gone, a new Paper dark. */
const snap = (rs: typeof viewRules): SnapRule[] =>
  rs.map((r, position) => ({ key: r.key, context: r.context, type: r.type, value: r.value, usage: r.usage, position, assets: [], label: r.label }));
const v12 = { rules: snap(viewRules), pages: null };
const v13 = {
  rules: snap([
    ...viewRules.filter((r) => r.key !== "color.accent").map((r) => (r.key === "color.primary" && !r.context ? { ...r, value: "#1a4fd6" } : r)),
    { ...viewRules.find((r) => r.key === "color.paper")!, context: "dark", value: "#14161c" },
  ]),
  pages: null,
};

const BASE = "/api/v1/brands/acme";
/** Bodies the form sent: POST .../publish, POST /sites, PATCH .../hub. */
let sent: { url: string; body: unknown }[] = [];
const record = async (request: Request) => sent.push({ url: new URL(request.url).pathname, body: await request.json() });

const meta = preview.meta({
  title: "App/Features/Builder/Publish dialog",
  component: ReleaseForm,
  args: { host: host(), onClose: fn() },
  argTypes: { host: { control: false } },
  decorators: [withMe(me), (Story) => <div className="max-w-lg">{Story()}</div>],
  beforeEach: ({ msw }) => {
    sent = [];
    msw.use(
      http.get(`${BASE}/versions`, () => HttpResponse.json({ data: versions })),
      http.get(`${BASE}/versions/12`, () => HttpResponse.json({ data: v12 })),
      http.get(`${BASE}/versions/13`, () => HttpResponse.json({ data: v13 })),
      http.post(`${BASE}/publish`, async ({ request }) => {
        await record(request);
        await delay(100);
        return HttpResponse.json({ data: { number: 13, portals: status.portals!.map(({ slug, name, url }) => ({ slug, name, url })), hub: { visibility: "public", url: status.hub!.url } } });
      }),
    );
  },
});

/** A draft to release: its number, how long it has waited, and what changes since the last release, line by line. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: /Release @13/ })).toBeInTheDocument();
    await expect(await canvas.findByRole("heading", { name: "What changes since @12" })).toBeInTheDocument();
    await expect(canvas.getByText("color.accent")).toBeInTheDocument();
    await expect(canvas.getByText("#1a4fd6")).toBeInTheDocument();
  },
});

/** A note, then Release: the note is what the publish sends, and the result names the portals it shows on. */
export const Publish = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Note for readers" }), "  Acme Blue, darker for contrast.  ");
    await userEvent.click(await canvas.findByRole("button", { name: "Release @13" }));
    await waitFor(() => expect(sent).toEqual([{ url: `${BASE}/publish`, body: { note: "Acme Blue, darker for contrast." } }]));
    await expect(await canvas.findByRole("heading", { name: "Released @13" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /Acme brand portal/ })).toHaveAttribute("href", "https://acme.artbucket.test");
    await expect(args.host.released).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
});

/** The release is refused: the reason, said where it happened, and the form kept to try again. */
export const PublishRefused = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.post(`${BASE}/publish`, async () => {
        await delay(100);
        return HttpResponse.json({ error: { code: "invalid", message: "A page binds color.accent, which no rule has." } }, { status: 422 });
      }),
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Release @13" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("A page binds color.accent, which no rule has.");
    await expect(canvas.getByRole("button", { name: "Release @13" })).toBeEnabled();
  },
});

/** Reading the history: the changes wait, the button doesn't. */
export const Loading = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get(`${BASE}/versions`, () => delay("infinite"))),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("region", { name: "What readers get" })).toHaveAttribute("aria-busy", "true");
  },
});

/** The history can't be read: said, and releasing still works. */
export const HistoryError = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get(`${BASE}/versions`, () => HttpResponse.json({ error: { message: "Couldn't read the history." } }, { status: 500 }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Couldn't read the history. You can still release.")).toBeInTheDocument();
  },
});

/** Nothing new since the last release: nothing to release. */
export const NothingNew = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get(`${BASE}/versions`, () => HttpResponse.json({ data: versions.slice(1) }))),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Nothing new: readers already see @12.")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Release" })).toBeDisabled();
  },
});

/** Open review comments: one click from the threads before readers get it. */
export const OpenComments = meta.story({
  args: { host: host({ comments: { open: 3, review: "/brands/acme/guidelines?comments=1" } }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("3 open comments on these pages.")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Review" })).toHaveAttribute("href", "/brands/acme/guidelines?comments=1");
  },
});

const unshared: Status = { ...emptyStatus, portals: [], hub: { ...status.hub!, visibility: "private" } };

/**
 * A first release of a brand only the team reads: the score it earns, and who should see it, asked in the same
 * step. A portal open to anyone is made after the release, then it goes public on BrandHub.
 */
export const FirstRelease = meta.story({
  args: { host: host({ status: unshared }) },
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get(`${BASE}/versions`, () => HttpResponse.json({ data: [] })),
      http.post(`${BASE}/publish`, async ({ request }) => {
        await record(request);
        return HttpResponse.json({ data: { number: 1, portals: [], hub: { visibility: "private", url: status.hub!.url } } });
      }),
      http.post("/api/v1/sites", async ({ request }) => {
        await record(request);
        return HttpResponse.json({ data: { slug: "acme", name: "Acme", url: "https://acme.artbucket.test" } });
      }),
      http.patch(`${BASE}/hub`, async ({ request }) => {
        await record(request);
        return HttpResponse.json({ data: { visibility: "public", url: status.hub!.url } });
      }),
    ),
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("First release: every page and rule.")).toBeInTheDocument();
    await expect(canvas.getByText("Brand Agent Score")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("radio", { name: "Anyone with the address" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: /Public on BrandHub/ }));
    await userEvent.click(canvas.getByRole("button", { name: "Release" }));
    await waitFor(() =>
      expect(sent).toEqual([
        { url: `${BASE}/publish`, body: {} },
        { url: "/api/v1/sites", body: { name: "Acme", slug: "acme", access: "public", brands: ["acme"] } },
        { url: `${BASE}/hub`, body: { visibility: "public" } },
      ]),
    );
    await expect(await canvas.findByRole("heading", { name: "Released @1" })).toBeInTheDocument();
    await expect(canvas.getByText(/Public on BrandHub, where anyone and any agent reads it/)).toBeInTheDocument();
  },
});

/** Someone who may not publish to BrandHub: only the portal is offered. */
export const NoHubRights = meta.story({
  args: { host: host({ status: unshared }) },
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("radiogroup", { name: "Who gets in to the portal" })).toBeInTheDocument();
    await expect(canvas.queryByRole("checkbox", { name: /Public on BrandHub/ })).not.toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
