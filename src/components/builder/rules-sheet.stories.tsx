import preview from "#.storybook/preview";
import { acmeInit, me, status, viewRules, withMe } from "#.storybook/fixtures/brands";
import { delay, http, HttpResponse } from "msw";
import { toast } from "sonner";
import { expect, screen, userEvent, waitFor } from "storybook/test";
import { RulesSheet } from "@/components/builder/rules-sheet";
import { useBuilder } from "@/components/builder/use-builder";
import type { ViewRule } from "@/lib/site";

/** The list on a builder of its own, as the brand's Rules tab shows it. */
function Builder({ rules }: { rules: ViewRule[] }) {
  const b = useBuilder("acme", acmeInit(rules));
  return <RulesSheet b={b} />;
}

/** What the sheet sent: PATCH /brand/rules bodies (set_rules) and PUT /brand/rules/order bodies, in order. */
let sent: unknown[] = [];
let ordered: unknown[] = [];
const ORDER = "/api/v1/brand/rules/order";

const meta = preview.meta({
  title: "App/Features/Builder/Rules sheet",
  component: Builder,
  args: { rules: viewRules },
  argTypes: { rules: { control: false } },
  decorators: [withMe(me)],
  beforeEach: ({ msw }) => {
    sent = [];
    ordered = [];
    msw.use(
      http.get("/api/v1/brands/acme/status", () => HttpResponse.json({ data: status })),
      http.get("/api/v1/brands/acme/source", () => HttpResponse.json({ data: { source: null, connect: null } })),
      http.patch("/api/v1/brand/rules", async ({ request }) => {
        sent.push(await request.json());
        await delay(50);
        return HttpResponse.json({ data: { brand: "acme" } });
      }),
      http.put(ORDER, async ({ request }) => {
        ordered.push(await request.json());
        return HttpResponse.json({ data: { brand: "acme" } });
      }),
    );
    return () => void toast.dismiss();
  },
});

/** Folds an open rule once its flow is done: its note editor and contrast badges are other components' (see the report). */
async function fold(name: RegExp) {
  await userEvent.click(await screen.findByRole("button", { name, expanded: true }));
  await waitFor(() => expect(screen.queryByRole("button", { name, expanded: true })).not.toBeInTheDocument());
}

/** The brand's Rules tab: every rule by section, in the page. */
export const Playground = meta.story({
  play: async () => {
    await expect(await screen.findByRole("heading", { name: "Color" })).toBeInTheDocument();
    await expect(screen.getByRole("textbox", { name: "Find a rule" })).toBeInTheDocument();
  },
});

/** One section at a time, from the chips under the search. */
export const OneSection = meta.story({
  play: async ({ userEvent }) => {
    const chips = await screen.findByRole("group", { name: "Show one section" });
    const font = Array.from(chips.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Font"))!;
    await userEvent.click(font);
    await expect(font).toHaveAttribute("aria-pressed", "true");
    await expect(screen.queryByRole("heading", { name: "Color" })).not.toBeInTheDocument();
    await expect(screen.getByRole("heading", { name: "Font" })).toBeInTheDocument();
  },
});

/** Delete from a row's menu: gone at once, as one remove; the toast's Undo sets it again. */
export const DeleteAndUndo = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.click(await screen.findByRole("button", { name: "More for Ink" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(sent).toEqual([{ set: [], remove: [{ key: "color.ink", context: null }] }]));
    await expect(screen.queryByRole("button", { name: "More for Ink" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(sent[1]).toEqual({ set: [{ key: "color.ink", label: "Ink", context: null, type: "color", value: "#0b1020", usage: null, assets: [], spec: null }] }),
    );
    await expect(await screen.findByRole("button", { name: "More for Ink" })).toBeInTheDocument();
  },
});

/** Move down from a row's menu, the keyboard's way to reorder: the section's new order, saved with PUT /brand/rules/order. */
export const MoveDown = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.click(await screen.findByRole("button", { name: "More for Ink" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Move down" }));
    await waitFor(() => expect(ordered).toEqual([{ keys: ["color.primary", "color.paper", "color.ink", "color.accent"] }]));
    // The row's menu closes as it acts: the a11y check runs once it is gone, not on its way out.
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  },
});

/** The order isn't saved: the rows go back, and a toast says so. */
export const MoveRefused = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.put(ORDER, () => HttpResponse.json({ error: { code: "invalid", message: "No" } }, { status: 422 }))),
  play: async ({ userEvent }) => {
    await userEvent.click(await screen.findByRole("button", { name: "More for Ink" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Move down" }));
    await expect(await screen.findByText("The new order couldn't be saved")).toBeInTheDocument();
    // The row's menu closes as it acts: the a11y check runs once it is gone, not on its way out.
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  },
});

/** Duplicate: every version again as "<name> copy", with its own key. */
export const Duplicate = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.click(await screen.findByRole("button", { name: "More for Tone of voice" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() =>
      expect(sent).toEqual([
        {
          set: [
            {
              key: "voice.toneOfVoiceCopy",
              label: "Tone of voice copy",
              context: null,
              type: "text",
              value: "Plain, warm and short. Say what it does, then stop.",
              usage: null,
              assets: [],
              spec: null,
            },
          ],
        },
      ]),
    );
    await fold(/^Tone of voice copy/);
    // The row's menu closes as it acts: the a11y check runs once it is gone, not on its way out.
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  },
});

/** A color with no dark value: Details offers one, a version of the rule for the dark context. */
export const DarkValue = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.click(await screen.findByRole("button", { name: /^ink Ink/ }));
    await userEvent.click(await screen.findByRole("button", { name: "A dark value" }));
    await waitFor(() =>
      expect(sent).toEqual([{ set: [{ key: "color.ink", label: "Ink", context: "dark", type: "color", value: "#0b1020", usage: null, assets: [], spec: null }] }]),
    );
    await fold(/^ink Ink/);
  },
});

/** A version for a context typed in Details: print, a channel. */
export const ContextVersion = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.click(await screen.findByRole("button", { name: /^Headings/ }));
    await userEvent.type(await screen.findByRole("combobox", { name: "Context of a new version" }), "Print");
    await userEvent.click(screen.getByRole("button", { name: "Add a version" }));
    await waitFor(() =>
      expect(sent).toEqual([
        {
          set: [
            {
              key: "font.heading",
              label: "Headings",
              context: "print",
              type: "font",
              value: { family: "Inter", size: 32, weight: 700 },
              usage: null,
              assets: [],
              spec: null,
            },
          ],
        },
      ]),
    );
    await expect(await screen.findByRole("button", { name: /^Headings.*2 versions/ })).toBeInTheDocument();
    await fold(/^Headings/);
  },
});

/** No rules yet. */
export const Empty = meta.story({
  args: { rules: [] },
  play: async () => {
    await expect(await screen.findByText("No rules yet. Start with a color, a typeface and the logo.")).toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
