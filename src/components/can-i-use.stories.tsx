import preview from "#.storybook/preview";
import { fixture } from "#.storybook/fixtures/artbucket";
import { expect, fireEvent, fn, waitFor } from "storybook/test";
import { CanIUse, type Use } from "@/components/can-i-use";
import { rightsReasons, type Reason, type Rights } from "@/lib/rights";

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
const refused = {
  allowed: false,
  reasons: [
    { code: "territory", message: "Licensed for DE and FR only", blocking: true },
    { code: "expiring", message: "Its license ends on Oct 30", blocking: false },
  ],
  suggest: [{ id: "ast_hero", title: "Autumn campaign hero", url: "https://app.acme.test/a/ast_hero", why: "Same campaign, licensed worldwide" }],
};

/**
 * "Can I use this?" (CanIUse): where, the country and the day it runs, and the check's verdict with its reasons and
 * what to use instead. `ask` posts the use to the check the surface may call; once asked, the verdict follows the use.
 */
const meta = preview.meta({
  title: "App/Features/Library/Can I use",
  component: CanIUse,
  decorators: [(Story) => <div className="w-full max-w-96">{Story()}</div>],
  args: { ask: fn(() => json({ allowed: true, reasons: [], suggest: [] })), context: false },
});

/** Allowed. Enter asks, as Check does; the use is sent trimmed, upper-cased where it should be. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Where"), "Paid-Social");
    await userEvent.type(canvas.getByLabelText("Territory"), "de{Enter}");
    await expect(await canvas.findByText("Yes, you can use it")).toBeInTheDocument();
    await expect(args.ask).toHaveBeenCalledWith({ channel: "paid-social", territory: "DE", date: undefined, context: undefined });
  },
});

/** Refused: why, and what to use instead, to open or copy. */
export const Refused = meta.story({
  args: { ask: fn(() => json(refused)), onOpen: fn() },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Check" }));
    await expect(await canvas.findByText("Not for this use")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Autumn campaign hero" }));
    await expect(args.onOpen).toHaveBeenCalledWith("ast_hero");
  },
});

/** A field the check refuses: its own message. */
export const Invalid = meta.story({
  args: { ask: fn(() => json({ error: { message: "Invalid", detail: { properties: { territory: { errors: ["A two-letter country code, like DE"] } } } } }, 422)) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Territory"), "x{Enter}");
    await expect(await canvas.findByText("A two-letter country code, like DE")).toBeInTheDocument();
  },
});

/** Offline: said in place. */
export const Offline = meta.story({
  args: { ask: fn(() => Promise.reject(new TypeError("Failed to fetch"))) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Check" }));
    await expect(await canvas.findByText("The check didn't answer: are you online?")).toBeInTheDocument();
  },
});

/** In the app: the brand's context too. Once asked, a changed use asks again by itself. */
export const WithContext = meta.story({
  args: { context: true },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Check" }));
    await canvas.findByText("Yes, you can use it");
    await userEvent.type(canvas.getByLabelText("Context"), "dark-background");
    await waitFor(() => expect(args.ask).toHaveBeenLastCalledWith(expect.objectContaining({ context: "dark-background" })), { timeout: 2000 });
  },
});

/**
 * What lib/core/check.ts answers for one file, on the rights it holds: `rightsReasons` is the core's own, so the
 * verdict, its reasons and their words are the check's; a replaced file names its replacement, as the check does.
 * Every use typed asks again, as in the app. The day is fixed, so a license window reads the same every day.
 */
const checked = (rights: Rights | null, replacedBy?: string) => (use: Use) => {
  const reasons: Reason[] = replacedBy ? [{ code: "superseded", blocking: true, message: `Replaced by ${replacedBy}` }] : [];
  reasons.push(...rightsReasons(rights, { channel: use.channel, territory: use.territory, date: use.date ?? "2026-10-16" }));
  const suggest = replacedBy ? [{ id: "ast_logo", title: replacedBy, url: "https://app.acme.test/a/ast_logo", why: "Its replacement" }] : [];
  return json({ allowed: !reasons.some((r) => r.blocking), reasons, suggest });
};

/**
 * The use, set as a change rather than typed: a framed story's document isn't focused (artbucket.io has the focus), and
 * typed keys don't reach an input there, while a change does.
 */
const fill = async (canvas: { getByLabelText: (label: string) => HTMLElement }, channel: string, territory: string) => {
  await fireEvent.change(canvas.getByLabelText("Where"), { target: { value: channel } });
  if (territory) await fireEvent.change(canvas.getByLabelText("Territory"), { target: { value: territory } });
};

/** As artbucket.io frames it: a still under CC BY 4.0, anywhere and for anything, asked for social in Germany. */
export const OnArtbucketAllowed = meta.story({
  globals: { fixture: "artbucket" },
  args: { ask: fn(checked({ license: "CC BY 4.0", territories: [], channels: [], embargo: null, expires: null, modelRelease: "not-needed" })) },
  play: async ({ canvas, userEvent }) => {
    await fill(canvas, "social", "DE");
    await userEvent.click(canvas.getByRole("button", { name: "Check" }));
    (document.activeElement as HTMLElement | null)?.blur();
    await expect(await canvas.findByText("Yes, you can use it")).toBeInTheDocument();
  },
});

/** As artbucket.io frames it: a stock photo licensed for the web and social in Germany and France, asked for print in the US. */
export const OnArtbucketRefused = meta.story({
  globals: { fixture: "artbucket" },
  args: { ask: fn(checked({ license: "Rights-managed stock", territories: ["DE", "FR"], channels: ["web", "social"], embargo: null, expires: "2026-12-31", modelRelease: "released" })) },
  play: async ({ canvas, userEvent }) => {
    await fill(canvas, "print", "US");
    await userEvent.click(canvas.getByRole("button", { name: "Check" }));
    (document.activeElement as HTMLElement | null)?.blur();
    await expect(await canvas.findByText("Not for this use")).toBeInTheDocument();
    await expect(canvas.getByText("Not licensed in US: DE, FR only")).toBeInTheDocument();
    await expect(canvas.getByText("Not licensed for print: web, social only")).toBeInTheDocument();
  },
});

/** As artbucket.io frames it: last week's logo, replaced since: refused, with its replacement to open or copy. */
export const OnArtbucketReplaced = meta.story({
  globals: { fixture: "artbucket" },
  args: { onOpen: fn() },
  // The replacement's name comes back from the check, not the args, so the fixture's names are swapped here.
  render: (args, { globals }) => <CanIUse {...args} ask={checked(null, fixture(globals, "acme-logo.svg"))} />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await fill(canvas, "web", "");
    await userEvent.click(canvas.getByRole("button", { name: "Check" }));
    (document.activeElement as HTMLElement | null)?.blur();
    await expect(await canvas.findByText("Replaced by artbucket-logo.svg")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "artbucket-logo.svg" })).toBeInTheDocument();
    await expect(canvasElement).not.toHaveTextContent(/acme/i);
  },
});

/** Acme's autumn campaign, as artbucket.io's marketing ops page frames it: a stock photo cleared for social in Germany. */
export const CampaignCleared = meta.story({
  args: { ask: fn(checked({ license: "Northwind Stock, rights-managed", territories: ["DE", "FR"], channels: ["web", "social"], embargo: null, expires: "2026-11-30", modelRelease: "released" })) },
  play: async ({ canvas, userEvent }) => {
    await fill(canvas, "social", "DE");
    await userEvent.click(canvas.getByRole("button", { name: "Check" }));
    await expect(await canvas.findByText("Yes, you can use it")).toBeInTheDocument();
    (document.activeElement as HTMLElement | null)?.blur();
  },
});

/** Acme's autumn campaign: a portrait whose model release is missing, asked for social: editorial use only. */
export const CampaignNoRelease = meta.story({
  args: { ask: fn(checked({ license: "Commissioned shoot", territories: [], channels: [], embargo: null, expires: null, modelRelease: "missing" })) },
  play: async ({ canvas, userEvent }) => {
    await fill(canvas, "social", "DE");
    await userEvent.click(canvas.getByRole("button", { name: "Check" }));
    await expect(await canvas.findByText("Not for this use")).toBeInTheDocument();
    await expect(canvas.getByText("People in it have not signed a model release: editorial use only")).toBeInTheDocument();
    (document.activeElement as HTMLElement | null)?.blur();
  },
});

/** Acme's autumn campaign: last season's logo, replaced since, with its replacement to open or copy. */
export const CampaignReplaced = meta.story({
  args: { ask: fn(checked(null, "acme-logo.svg")), onOpen: fn() },
  play: async ({ canvas, userEvent }) => {
    await fill(canvas, "social", "DE");
    await userEvent.click(canvas.getByRole("button", { name: "Check" }));
    await expect(await canvas.findByText("Replaced by acme-logo.svg")).toBeInTheDocument();
    (document.activeElement as HTMLElement | null)?.blur();
  },
});
