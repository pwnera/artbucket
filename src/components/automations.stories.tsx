import preview from "#.storybook/preview";
import { NOW, acme, automations, brands, editor, longBrand, me, withMe } from "#.storybook/fixtures/brands";
import { inApp } from "#.storybook/fixtures/library";
import { delay, http, HttpResponse } from "msw";
import { expect, screen, waitFor } from "storybook/test";
import { Automations, type AutomationRow } from "@/components/automations";

/** What the last write sent, for a play test to read: reset before each story. */
let sent: { method: string; url: string; body: unknown }[] = [];
const take = (status = 200, answer?: (body: Record<string, unknown>, id: string | undefined) => unknown) =>
  async ({ request, params }: { request: Request; params: Record<string, string | readonly string[] | undefined> }) => {
    const body = request.method === "DELETE" ? null : ((await request.json().catch(() => null)) as Record<string, unknown> | null);
    sent.push({ method: request.method, url: new URL(request.url).pathname, body });
    await delay(50);
    if (status !== 200) return HttpResponse.json({ error: { code: "invalid", message: "That address doesn't answer" } }, { status });
    const id = typeof params.id === "string" ? params.id : undefined;
    return HttpResponse.json({ data: answer ? answer(body ?? {}, id) : {} });
  };
const echo = (body: Record<string, unknown>, id: string | undefined): AutomationRow => ({ ...(automations.find((a) => a.id === id) ?? automations[0]), id: id ?? "aut_new", ...body } as AutomationRow);
const last = () => sent.at(-1);

const meta = preview.meta({
  title: "App/Features/Automations",
  component: Automations,
  args: { automations, brands },
  // Inner first: who is looking (Ada, an admin), inside the app's shell.
  decorators: [withMe(me), inApp],
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/automations" } } },
  beforeEach: ({ msw }) => {
    sent = [];
    msw.use(
      http.post("/api/v1/automations", take(200, (b) => ({ ...echo(b, "aut_new"), ...(b.action === "webhook" && { host: "ci.acme.test", secret: "whsec_3f9a1c7e2b" }) }))),
      http.patch("/api/v1/automations/:id", take(200, echo)),
      http.delete("/api/v1/automations/:id", take()),
    );
    // "Delivered 2 days ago" is read against a fixed now.
    // Swapped by hand: a spy on Date.now recurses through the test's own instrumentation.
    const real = Date.now;
    Date.now = () => NOW.getTime();
    return () => void (Date.now = real);
  },
});

/** The project's automations, each with its last delivery, on or off, a test and its run log. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Tell the brand team")).toBeInTheDocument();
    await expect(canvas.getByText("When Acme is released, email brand@acme.test")).toBeInTheDocument();
    await expect(canvas.getByText(/Delivered 2 days ago/)).toBeInTheDocument();
    await expect(canvas.getByRole("switch", { name: "Licenses ending, to legal on" })).not.toBeChecked();
  },
});

/** New automation: name, when, who it tells; the body POSTed is what the form says. */
export const Create = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "New automation" }));
    const dialog = await screen.findByRole("dialog", { name: "New automation" });
    await userEvent.type(screen.getByLabelText("Name"), "Release mail");
    await userEvent.type(screen.getByLabelText("To"), "brand@acme.test, legal@acme.test");
    await userEvent.click(screen.getByRole("button", { name: "Make it" }));
    await waitFor(() => expect(last()).toEqual({ method: "POST", url: "/api/v1/automations", body: { name: "Release mail", trigger: "brand.released", brand: null, action: "email", emails: ["brand@acme.test", "legal@acme.test"] } }));
    await expect(await screen.findByText("Made Release mail")).toBeInTheDocument();
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  },
});

/** Changing one: the dialog opens on what it says, and a PATCH sends the whole of it again. */
export const Edit = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Change Tell the brand team" }));
    await screen.findByRole("dialog", { name: "Change Tell the brand team" });
    const name = screen.getByLabelText("Name");
    await expect(name).toHaveValue("Tell the brand team");
    await userEvent.clear(name);
    await userEvent.type(name, "Tell the whole team");
    // A license warning instead: its own field shows.
    await userEvent.click(screen.getByRole("combobox", { name: "When" }));
    await userEvent.click(await screen.findByRole("option", { name: "A license is about to end" }));
    await expect(screen.getByLabelText("Days before its last day")).toHaveValue(30);
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(last()).toEqual({ method: "PATCH", url: "/api/v1/automations/aut_release", body: { name: "Tell the whole team", trigger: "asset.expiring", days: 30, action: "email", emails: ["brand@acme.test"] } }),
    );
    await expect(await screen.findByText("Saved Tell the whole team")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** On and off from the list: a PATCH of `enabled` alone. */
export const Toggle = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("switch", { name: "Licenses ending, to legal on" }));
    await waitFor(() => expect(last()).toEqual({ method: "PATCH", url: "/api/v1/automations/aut_licenses", body: { enabled: true } }));
    await userEvent.click(canvas.getByRole("switch", { name: "Tell the brand team on" }));
    await waitFor(() => expect(last()).toEqual({ method: "PATCH", url: "/api/v1/automations/aut_release", body: { enabled: false } }));
  },
});

/** Delete asks first, then sends DELETE; the dialog closes once it worked. */
export const Delete = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete New share links to Slack" }));
    const ask = await screen.findByRole("alertdialog", { name: "Delete New share links to Slack?" });
    await expect(ask).toHaveTextContent("its run log goes with it");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(last()).toEqual({ method: "DELETE", url: "/api/v1/automations/aut_shares", body: null }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  },
});

/** From a recipe: the dialog starts from it; a webhook's secret is shown once, as it is made. */
export const FromRecipe = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "From a recipe" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Rebuild a site on each release/ }));
    await screen.findByRole("dialog", { name: "New automation" });
    await expect(screen.getByLabelText("Name")).toHaveValue("Rebuild a site on each release");
    await userEvent.type(screen.getByLabelText("URL"), "https://ci.acme.test/hooks/artbucket");
    await expect(screen.getByLabelText("URL")).toHaveValue("https://ci.acme.test/hooks/artbucket");
    await userEvent.click(screen.getByRole("button", { name: "Make it" }));
    await waitFor(() =>
      expect(last()?.body).toEqual({ name: "Rebuild a site on each release", trigger: "brand.released", brand: null, action: "webhook", format: "json", url: "https://ci.acme.test/hooks/artbucket" }),
    );
    await expect(await canvas.findByText("whsec_3f9a1c7e2b")).toBeInTheDocument();
    await expect(canvas.getByText(/isn't shown again/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** A refused save (422) says why in a toast, and the dialog stays with what was typed. */
export const SaveFails = meta.story({
  beforeEach: ({ msw }) => void msw.use(http.post("/api/v1/automations", take(422))),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "New automation" }));
    await screen.findByRole("dialog", { name: "New automation" });
    await userEvent.type(screen.getByLabelText("Name"), "Release mail");
    await userEvent.type(screen.getByLabelText("To"), "brand@acme.test");
    await userEvent.click(screen.getByRole("button", { name: "Make it" }));
    await expect(await screen.findByText("That address doesn't answer")).toBeInTheDocument();
    await expect(screen.getByLabelText("Name")).toHaveValue("Release mail");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** Send a test: the run lands in the log, opened to show it. */
export const SendATest = meta.story({
  beforeEach: ({ msw }) =>
    void msw.use(
      http.post("/api/v1/automations/:id/test", () =>
        HttpResponse.json({ data: { id: "run_test", status: "delivered", test: true, payload: { event: "brand.released", brand: { slug: "acme", name: "Acme" }, version: 12 }, attempts: [{ at: NOW.toISOString(), ok: true, code: 200, error: null }], nextAt: null, createdAt: NOW.toISOString() } }),
      ),
      http.get("/api/v1/automations/:id/runs", () =>
        HttpResponse.json({ data: [{ id: "run_test", status: "delivered", test: true, payload: { event: "brand.released", brand: { slug: "acme", name: "Acme" }, version: 12 }, attempts: [{ at: NOW.toISOString(), ok: true, code: 200, error: null }], nextAt: null, createdAt: NOW.toISOString() }] }),
      ),
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: "Send a test" })[0]);
    await expect(await screen.findByText("Test sent to brand@acme.test")).toBeInTheDocument();
    await expect(await canvas.findByText("Test")).toBeInTheDocument();
    await expect(canvas.getByText("Attempt 1, just now: delivered (200)")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Hide the runs of Tell the brand team" })).toBeInTheDocument();
  },
});

/** The run log of one that hasn't run yet. */
export const NoRunsYet = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Show the runs of Licenses ending, to legal" }));
    await expect(await canvas.findByText(/It hasn't run yet/)).toBeInTheDocument();
  },
});

/** Nothing yet: a way to start, and the recipes to start from. */
export const Empty = meta.story({
  args: { automations: [] },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Nothing automated yet")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /Licenses ending, to legal/ }));
    await screen.findByRole("dialog", { name: "New automation" });
    await expect(screen.getByLabelText("Days before its last day")).toHaveValue(30);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
});

/** A brand's editor, not an admin: only release automations, and only for the brands they edit. */
export const Editor = meta.story({
  args: { automations: [] },
  decorators: [withMe(editor)],
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /Rebuild a site on each release/ })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /Licenses ending, to legal/ })).not.toBeInTheDocument();
  },
});

/** Long names and many recipients truncate on their line. */
export const LongNames = meta.story({
  args: {
    automations: [
      { ...automations[0], id: "aut_long", name: "Tell every regional brand team and the agency partners when the partner programme brand is released", brand: longBrand.slug, emails: ["emea-brand@acme.test", "americas-brand@acme.test", "apac-brand@acme.test", "agency@northwind.test"] },
      ...automations.slice(1),
    ],
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

/** One brand only: the brand picker offers Acme and Any brand. */
export const OneBrand = meta.story({ args: { brands: [acme] } });
