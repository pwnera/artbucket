import preview from "#.storybook/preview";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor } from "storybook/test";
import { recorder } from "#.storybook/fixtures/brands";
import { FeatureManage, type ManageView } from "@/components/settings/feature-manage";

const sent = recorder();
const MANAGE = "/api/v1/features/intelligence/manage";
const view: ManageView = {
  badge: { label: "On", tone: "on" },
  lead: "Tags new assets and reads brand guidelines, by a model, within this month's caps.",
  sections: [
    {
      title: "This month",
      note: "Resets on 1 November",
      meters: [
        { label: "Files tagged", used: 1840, cap: 10000 },
        { label: "Brands imported", used: 10000, cap: 10000 },
      ],
    },
    { title: "Backlog", figure: { value: 312, label: "assets waiting to be tagged" }, actions: [{ id: "tag-all", label: "Tag them now" }, { id: "skip", label: "Skip them", variant: "outline" }] },
    { title: "Import", progress: { value: 4, total: 9, label: "Reading the Acme guidelines PDF, page 4 of 9" }, text: "Rules found so far wait on the brand's Rules tab.", links: [{ label: "Open Acme's rules", href: "/brands/acme/rules" }] },
    { title: "Model", text: "Claude Sonnet, in the EU.", links: [{ label: "Pricing", href: "https://artbucket.test/pricing" }], footnote: "Files leave the server only to be read, and are not kept." },
  ],
  refresh: null,
};

const meta = preview.meta({
  title: "App/Features/Settings/Feature manage",
  component: FeatureManage,
  args: { name: "Intelligence", url: MANAGE, open: true, onOpenChange: fn() },
  beforeEach: ({ msw }) => {
    sent.reset();
    msw.use(sent.on("get", MANAGE, view));
  },
});

/** A server feature's own view under Manage: meters, a figure, progress, text, links and its actions. */
export const Playground = meta.story({
  play: async () => {
    await expect(await screen.findByText(view.lead!)).toBeInTheDocument();
    await expect(screen.getByRole("progressbar", { name: "18% used" })).toBeInTheDocument();
  },
});

/** Reading it: the dialog says so until the view arrives. */
export const Loading = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.get(MANAGE, async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    ),
  play: async () => {
    await expect(await screen.findByText("Reading what it says…")).toBeInTheDocument();
  },
});

/** An action runs, and the view it answers replaces the one shown. */
export const RunAction = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("post", `${MANAGE}/actions/:id`, { ...view, lead: "Tagging 312 assets." })),
  play: async ({ userEvent }) => {
    await userEvent.click(await screen.findByRole("button", { name: "Tag them now" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: `${MANAGE}/actions/tag-all`, body: null }));
    await expect(await screen.findByText("Tagging 312 assets.")).toBeInTheDocument();
  },
});

/** The feature didn't answer: its message, and Try again reads it once more. */
export const Failed = meta.story({
  beforeEach: ({ msw }) => {
    let tries = 0;
    msw.use(
      http.get(MANAGE, () =>
        tries++ === 0 ? HttpResponse.json({ error: { code: "unavailable", message: "Intelligence is restarting" } }, { status: 503 }) : HttpResponse.json({ data: view }),
      ),
    );
  },
  play: async ({ userEvent }) => {
    await expect(await screen.findByText("Intelligence is restarting")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await expect(await screen.findByText(view.lead!)).toBeInTheDocument();
  },
});

/** Off, with nothing more to say than its lead. */
export const Off = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.get(MANAGE, () => HttpResponse.json({ data: { badge: { label: "Off", tone: "off" }, lead: "Turned off for this project.", sections: [], refresh: null } }))),
  play: async () => {
    await expect(await screen.findByText("Turned off for this project.")).toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
