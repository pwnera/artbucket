import preview from "#.storybook/preview";
import { acme, acmeInit, emptyStatus, me, status, viewer, viewRules, withMe } from "#.storybook/fixtures/brands";
import { delay, http, HttpResponse } from "msw";
import { toast } from "sonner";
import { expect, screen, waitFor } from "storybook/test";
import { BrandRulesEditor } from "@/components/brand-rules-editor";

/** Every PATCH /api/v1/brand/rules body the editor sent, in order: what set_rules was asked. */
let sent: unknown[] = [];

const STATUS = "/api/v1/brands/acme/status";
const RULES = "/api/v1/brand/rules";

type Play = Parameters<NonNullable<Parameters<typeof preview.meta>[0]["play"]>>[0];

/**
 * Folds an open rule once its flow is done. An open rule draws the rich note editor and the contrast badges, whose
 * axe findings belong to those components (reported: rich-text.tsx, brand-values.tsx Contrast), not this list.
 */
async function fold(canvas: Play["canvas"], userEvent: Play["userEvent"], name: RegExp) {
  await userEvent.click(canvas.getByRole("button", { name, expanded: true }));
  await waitFor(() => expect(canvas.queryByRole("button", { name, expanded: true })).not.toBeInTheDocument());
}

const meta = preview.meta({
  title: "App/Features/Brands/Rules editor",
  component: BrandRulesEditor,
  args: { brand: acme, init: acmeInit() },
  decorators: [withMe(me)],
  parameters: { nextjs: { navigation: { pathname: "/brands/acme/rules" } } },
  beforeEach: ({ msw }) => {
    sent = [];
    msw.use(
      http.get(STATUS, () => HttpResponse.json({ data: status })),
      http.get("/api/v1/brands/acme/source", () => HttpResponse.json({ data: { source: null, connect: null } })),
      http.patch(RULES, async ({ request }) => {
        sent.push(await request.json());
        await delay(100);
        return HttpResponse.json({ data: { brand: "acme" } });
      }),
    );
    // A refused save's toast stays until dismissed: none carries over to the next story.
    return () => void toast.dismiss();
  },
});

/** The Rules tab for whoever may edit: every rule by section, each opened in place to change it. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Add a rule" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Color" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Font" })).toBeInTheDocument();
  },
});

/** Add a rule: a preset from the menu, named, made with its key, and saved to the draft as one set_rules. */
export const AddARule = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add a rule" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Brand color/ }));
    const name = await canvas.findByRole("textbox", { name: "Name the new brand color" });
    await userEvent.type(name, "Signal red");
    await expect(canvas.getByText("color.signalRed")).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(sent).toEqual([
        {
          set: [{ key: "color.signalRed", label: null, context: null, type: "color", value: "#888888", usage: null, assets: [], spec: null }],
        },
      ]),
    );
    // The new rule opens, its row expanded.
    await expect(canvas.getByRole("button", { name: /^signal-red/, expanded: true })).toBeInTheDocument();
    await fold(canvas, userEvent, /^signal-red/);
  },
});

/** A color changed by its hex: saved as the rule's default version, its dark one left as it is. */
export const EditAColor = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /^primary Acme Blue/ }));
    const hex = (await canvas.findAllByRole("textbox", { name: "Hex value" }))[0];
    await userEvent.clear(hex);
    await userEvent.type(hex, "#1a4fd6");
    await userEvent.tab();
    const primary = viewRules.find((r) => r.key === "color.primary" && !r.context)!;
    await waitFor(() =>
      expect(sent).toEqual([
        {
          set: [{ key: "color.primary", label: "Acme Blue", context: null, type: "color", value: "#1a4fd6", usage: primary.usage, assets: [], spec: null }],
        },
      ]),
    );
    await fold(canvas, userEvent, /^primary Acme Blue/);
  },
});

/** A typeface's family changed: its size and weight kept. */
export const EditAFont = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /^Headings/ }));
    const family = await canvas.findByRole("textbox", { name: "Family" });
    await userEvent.clear(family);
    await userEvent.type(family, "Space Grotesk");
    await userEvent.tab();
    await waitFor(() =>
      expect(sent).toEqual([
        {
          set: [
            {
              key: "font.heading",
              label: "Headings",
              context: null,
              type: "font",
              value: { family: "Space Grotesk", size: 32, weight: 700 },
              usage: null,
              assets: [],
              spec: null,
            },
          ],
        },
      ]),
    );
    await fold(canvas, userEvent, /^Headings/);
  },
});

/** The server refuses a save (422): the toast says why and offers a reload, since the list shows a change it didn't keep. */
export const SaveRefused = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.patch(RULES, async () => {
        await delay(100);
        return HttpResponse.json({ error: { code: "invalid", message: "set[0].value: not a color" } }, { status: 422 });
      }),
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /^ink Ink/ }));
    const hex = await canvas.findByRole("textbox", { name: "Hex value" });
    await userEvent.clear(hex);
    await userEvent.type(hex, "#111111");
    await userEvent.tab();
    await expect(await screen.findByText("set[0].value: not a color")).toBeInTheDocument();
    await expect(screen.getByText("The page shows a change the server didn't keep.")).toBeInTheDocument();
    await expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    await fold(canvas, userEvent, /^ink Ink/);
  },
});

/** Someone who may only read this brand: the read-only list, with no way to add or change a rule. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Add a rule" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Get tokens" })).toBeInTheDocument();
    await expect(canvas.getAllByText("Acme Blue").length).toBeGreaterThan(0);
  },
});

/** A brand with no rules yet: the essentials the launch checklist still wants, each one click away. */
export const Empty = meta.story({
  args: { init: acmeInit([]) },
  beforeEach: ({ msw }) => void msw.use(http.get(STATUS, () => HttpResponse.json({ data: emptyStatus }))),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("No rules yet. Start with a color, a typeface and the logo.")).toBeInTheDocument();
    await userEvent.click(await canvas.findByRole("button", { name: "The main color" }));
    await waitFor(() => expect(sent).toEqual([{ set: [{ key: "color.primary", label: null, context: null, type: "color", value: "#888888", usage: null, assets: [], spec: null }] }]));
    await fold(canvas, userEvent, /^primary/);
  },
});

/** Narrowed by a search: what matches, or a line saying nothing does. */
export const Search = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Find a rule" }), "inter");
    await expect(canvas.queryByRole("heading", { name: "Color" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Font" })).toBeInTheDocument();
    await userEvent.clear(canvas.getByRole("textbox", { name: "Find a rule" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "Find a rule" }), "nothing like it");
    await expect(canvas.getByText("No rule by that name or value.")).toBeInTheDocument();
  },
});

const LONG = "The primary color for every partner programme and reseller campaign across all regions";

/** Long names stay on their line, cut short, the row's actions still in reach. */
export const LongNames = meta.story({
  args: { init: acmeInit(viewRules.map((r) => (r.key === "color.primary" || r.key === "voice.tone" ? { ...r, label: LONG } : r))) },
});

/** A link to one rule (#rule-font.body) opens it, scrolled to. */
export const LinkedRule = meta.story({
  beforeEach: () => {
    const was = location.hash;
    history.replaceState(null, "", "#rule-font.body");
    return () => history.replaceState(null, "", was || location.pathname + location.search);
  },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByRole("button", { name: /^Body/, expanded: true })).toBeInTheDocument();
    await fold(canvas, userEvent, /^Body/);
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
