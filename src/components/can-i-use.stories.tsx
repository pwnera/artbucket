import preview from "#.storybook/preview";
import { expect, fn, waitFor } from "storybook/test";
import { CanIUse } from "@/components/can-i-use";

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
  decorators: [(Story) => <div className="w-96">{Story()}</div>],
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
