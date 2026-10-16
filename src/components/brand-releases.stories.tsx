import preview from "#.storybook/preview";
import { acme, assetFiles, emptyStatus, freezeNow, me, northwind, release, rules, status, updates, versions, viewer, withMe } from "#.storybook/fixtures/brands";
import { useEffect, useState } from "react";
import { fixture, swapApi } from "#.storybook/fixtures/artbucket";
import { inApp } from "#.storybook/fixtures/library";
import { OUR_BOOK } from "#.storybook/fixtures/our-brand";
import { getRouter, useSelectedLayoutSegments } from "@storybook/nextjs-vite/navigation.mock";
import { http, HttpResponse } from "msw";
import { expect, mocked, waitFor } from "storybook/test";
import { BrandPageHeader } from "@/components/brand-header";
import { NewRelease, ReleaseList } from "@/components/brand-releases";
import { accentCss } from "@/lib/color";
import type { Update } from "@/lib/history";

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
    await expect(canvas.getByRole("link", { name: "Notify on release" })).toHaveAttribute("href", "/automations?recipe=release-to-team&brand=acme");
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
    await expect(canvas.queryByRole("link", { name: "Notify on release" })).not.toBeInTheDocument();
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

/** The brand's header, as the tabs' layout draws it over each tab, on the Releases tab. */
const header = <BrandPageHeader brand={acme} origin="https://app.artbucket.test" rules={rules} status={status} release={release} importing={false} />;

/** The Releases tab in the app, as artbucket.io's solution pages frame it: the header, then what readers got. */
export const ReleasesTab = meta.story({
  decorators: [inApp],
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/brands/acme/releases" } } },
  beforeEach: ({ msw }) => {
    msw.use(assetFiles);
    mocked(useSelectedLayoutSegments).mockReturnValue(["releases"]);
  },
  render: (args) => (
    <>
      {header}
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 md:px-6">
        <ReleaseList {...args} />
      </div>
    </>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Unreleased changes since @12")).toBeInTheDocument();
  },
});

/** New release in the app, as artbucket.io's solution pages frame it: what changes since @12, before the note is written. */
export const NewReleaseTab = meta.story({
  decorators: [inApp],
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/brands/acme/releases" } } },
  render: () => (
    <>
      {header}
      <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-16 md:px-6">
        <NewRelease slug="acme" target={acme} name="Acme" status={status} comments={2} />
      </div>
    </>
  ),
  beforeEach: ({ msw }) => {
    msw.use(assetFiles, ...history);
    mocked(useSelectedLayoutSegments).mockReturnValue(["releases"]);
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("What changes since @12")).toBeInTheDocument();
  },
});

/**
 * As artbucket.io frames it on /guidelines (`globals=fixture:artbucket`): our own rules (the core's brand/ folder) with
 * Monday's change in the draft, this week's accent going from Volt to Iris, line by line before Release.
 */
export const OnArtbucket = meta.story({
  globals: { fixture: "artbucket" },
  render: (_, { globals }) => <NewRelease slug="acme" target={fixture(globals, acme)} name="Artbucket" status={fixture(globals, status)} comments={0} />,
  beforeEach: (ctx) => {
    const ours = OUR_BOOK.rules as typeof rules;
    const next = ours.map((r) => (r.key === "color.primary" && !r.context ? { ...r, label: "Iris", value: "#6b4dff" } : r));
    ctx.msw.use(
      http.get(`${base}/versions`, () => HttpResponse.json({ data: versions })),
      http.get(`${base}/versions/12`, () => HttpResponse.json({ data: snap(ours) })),
      http.get(`${base}/versions/13`, () => HttpResponse.json({ data: snap(next) })),
      http.post(`${base}/publish`, () => HttpResponse.json({ data: { number: 13, portals: status.portals } })),
    );
    return swapApi(ctx);
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("What changes since @12")).toBeInTheDocument();
    await expect(await canvas.findByText("color.primary")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Release @13" })).toBeEnabled();
  },
});

/** The weekly accents, in their order (scripts/weekly-accent.mjs in the hosted repo releases the next each Monday). */
const WEEKS = [["Volt", "#c6f432"], ["Iris", "#6b4dff"], ["Signal", "#ff5b1f"], ["Tide", "#2f62ff"], ["Moss", "#14a874"], ["Fuchsia", "#c92a72"]] as const;
/** Where Monday's release is: this week's accent (0 to 5), the step (0 Sunday, 1 the push, 2 released, 3 and 4 followed), the live release's number. */
type Stage = { week: number; step: number; release: number };
/** Who may move it: artbucket.io's stage, which frames this story, and a local site. */
const STAGED_BY = /^(https:\/\/(www\.|dev\.)?artbucket\.io|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

/** The stage's place, as its args start it (a change of args remounts it), then as the framing page posts it (`{ type: "artbucket:stage", ...Stage }`). */
function useStage(start: Stage) {
  const [stage, setStage] = useState(start);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      const d = e.data as Partial<Stage> & { type?: string };
      if (e.source !== window.parent || !STAGED_BY.test(e.origin) || d?.type !== "artbucket:stage") return;
      const n = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : null);
      const week = n(d.week, 5), step = n(d.step, 4), release = n(d.release, 100_000);
      if (week !== null && step !== null && release) setStage({ week, step, release });
    };
    addEventListener("message", on);
    return () => removeEventListener("message", on);
  }, []);
  return stage;
}

const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const weekly = (version: number, week: number, daysAgo: number): Update => ({
  version,
  publishedAt: days(daysAgo),
  publishedBy: "weekly-accent",
  note: `${WEEKS[(week + 6) % 6][0]}, the week's accent.`,
  image: null,
  changes: { rules: { added: [], changed: ["color.primary"], removed: [] }, pages: { added: [], changed: [], removed: [] } },
});

/** Our brand's Releases tab on a Monday: the push, the release, then the app on the new accent, as the stage says. */
function WeeklyTab({ stage: start, globals }: { stage: Stage; globals: Record<string, unknown> }) {
  const { week, step, release: latest } = useStage(start);
  const released = step >= 2;
  const live = released ? latest + 1 : latest;
  const updates = [...(released ? [weekly(latest + 1, week + 1, 0)] : []), weekly(latest, week, 7), weekly(latest - 1, week - 1, 14), weekly(latest - 2, week - 2, 21)];
  // The app follows the brand (Settings, Branding): on the new accent once the sites do.
  const accent = WEEKS[(step >= 3 ? week + 1 : week) % 6][1];
  const brand = fixture(globals, acme);
  return (
    <>
      <style>{accentCss(accent)}</style>
      <BrandPageHeader brand={brand} origin="https://app.artbucket.io" rules={rules} status={{ ...fixture(globals, status), publish: step === 1 ? "behind" : "current" }} release={{ ...release, number: live, note: updates[0].note, publishedAt: updates[0].publishedAt }} importing={false} />
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 md:px-6">
        <ReleaseList slug={brand.slug} target={brand} updates={updates} pending={step === 1} />
      </div>
    </>
  );
}

/**
 * As artbucket.io's home frames it (`globals=fixture:artbucket`): our brand's weekly accent going out, step by step.
 * The page posts where its stage is; the args set where it starts.
 */
export const WeeklyAccent = meta.story({
  globals: { fixture: "artbucket" },
  args: { stage: { week: 0, step: 0, release: 43 } } as never,
  decorators: [inApp],
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/brands/artbucket/releases" } } },
  beforeEach: ({ msw }) => {
    msw.use(assetFiles);
    mocked(useSelectedLayoutSegments).mockReturnValue(["releases"]);
  },
  render: (args, { globals }) => {
    const { stage } = args as unknown as { stage: Stage };
    return <WeeklyTab key={`${stage.week}.${stage.step}.${stage.release}`} stage={stage} globals={globals} />;
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Volt, the week's accent.")).toBeInTheDocument();
    await expect(canvas.queryByText("Unreleased changes since @43")).not.toBeInTheDocument();
  },
});

/** The same, on Monday: the push waits as unreleased changes, then the release and the app on Iris. */
export const WeeklyAccentReleased = meta.story({
  ...WeeklyAccent.input,
  args: { stage: { week: 0, step: 3, release: 43 } } as never,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Iris, the week's accent.")).toBeInTheDocument();
    await expect(canvas.getAllByText("@44")[0]).toBeInTheDocument();
  },
});
