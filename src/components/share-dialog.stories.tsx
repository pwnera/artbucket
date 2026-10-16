import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { as, collections, inApp, shareLink } from "#.storybook/fixtures/library";
import { SendLinkDialog, ShareDialog } from "@/components/share-dialog";

const sent: { method: string; url: string; body: unknown }[] = [];

/**
 * Share (ShareDialog): a link for someone without an account, to look at a collection or an asset, or to send files
 * into one for review. It can expire, ask for a password and go out by email. Links already made for the same thing
 * come first, to copy or revoke. An asset asks who can open it: the team, anyone with a link, or anyone (embed).
 */
const meta = preview.meta({
  title: "App/Features/Library/Share dialog",
  component: ShareDialog,
  decorators: [as],
  args: {
    target: { kind: "view" as const, asset: { id: "ast_hero", name: "Autumn campaign hero", path: "/a/ast_hero/autumn-campaign-hero.jpg", shareable: true } },
    collections,
    onClose: fn(),
    onMade: fn(),
    onChanged: fn(),
  },
  beforeEach: ({ msw }) => {
    sent.length = 0;
    msw.use(
      http.get("/api/v1/shares", () => HttpResponse.json({ data: [shareLink()] })),
      http.post("/api/v1/shares", async ({ request }) => {
        const body = (await request.json()) as { name?: string; password?: string; expiresAt?: string };
        sent.push({ method: "POST", url: "/api/v1/shares", body });
        return HttpResponse.json({ data: shareLink({ id: "shr_new", name: body.name ?? null, password: !!body.password, expiresAt: body.expiresAt ?? null }) });
      }),
      http.post("/api/v1/shares/:id/send", async ({ request }) => {
        const body = (await request.json()) as { emails: string[] };
        sent.push({ method: "POST", url: "/api/v1/shares/send", body });
        return HttpResponse.json({ data: { emailed: body.emails.length } });
      }),
      http.delete("/api/v1/shares/:id", ({ params }) => {
        sent.push({ method: "DELETE", url: `/api/v1/shares/${params.id}`, body: null });
        return HttpResponse.json({ data: {} });
      }),
      http.patch("/api/v1/assets/:id", async ({ request }) => {
        const body = (await request.json()) as { public: boolean };
        sent.push({ method: "PATCH", url: "/api/v1/assets", body });
        return HttpResponse.json({ data: { id: "ast_hero", public: body.public } });
      }),
    );
  },
});

/** An asset, by link: name it, send it to two people, a week, a password; the link is made, then emailed. */
export const Playground = meta.story({
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: /Share Autumn campaign hero/ });
    // One screen: no tabs, the link first.
    await expect(within(dialog).queryByRole("tab")).not.toBeInTheDocument();
    const name = within(dialog).getByLabelText("What they see it called");
    await userEvent.clear(name);
    await userEvent.type(name, "Hero for Northwind");
    await userEvent.type(within(dialog).getByLabelText("Send it to"), "lena@northwind.test; ops@northwind.test");
    await userEvent.click(within(dialog).getByRole("radio", { name: "7 days" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Generate" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Make link" }));
    await waitFor(() => expect(sent).toHaveLength(2));
    await expect(sent[0].body).toEqual({ kind: "view", asset: "ast_hero", name: "Hero for Northwind", password: expect.stringMatching(/^\w{12}$/), expiresAt: expect.any(String) });
    await expect(sent[1].body).toEqual({ emails: ["lena@northwind.test", "ops@northwind.test"] });
    await expect(await within(dialog).findByText(/Emailed to 2 people/)).toBeInTheDocument();
    await expect(args.onMade).toHaveBeenCalled();
  },
});

/** A typo in an address: said beside the field, and nothing is made. */
export const BadEmail = meta.story({
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Send it to"), "lena@northwind");
    await userEvent.click(within(dialog).getByRole("button", { name: "Make link" }));
    await expect(await within(dialog).findByRole("alert")).toHaveTextContent("“lena@northwind” isn't an email address.");
    await expect(sent).toHaveLength(0);
  },
});

/** Embed, under the link: switch public on, and the two URLs to embed. */
export const Embed = meta.story({
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("switch"));
    await waitFor(() => expect(sent).toEqual([{ method: "PATCH", url: "/api/v1/assets", body: { public: true } }]));
    await expect(await within(dialog).findByText("Always the current version")).toBeInTheDocument();
    await expect(args.onChanged).toHaveBeenCalledWith({ id: "ast_hero", public: true });
  },
});

/** Not shareable yet (waiting for approval, or not the viewer's to share): its team link only. */
export const TeamOnly = meta.story({
  args: { target: { kind: "view", asset: { id: "ast_ai", name: "generated-moodboard.png", shareable: false } } },
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await expect(within(dialog).queryByRole("button", { name: "Make link" })).not.toBeInTheDocument();
    await expect(within(dialog).getByText(/Shareable once approved, by someone who may share it/)).toBeInTheDocument();
  },
});

/** A collection with a link already: copy or revoke it first, New link after. */
export const ExistingLink = meta.story({
  args: { target: { kind: "view", collection: { id: "col_press", name: "Press" } } },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Share Press" });
    await expect(await within(dialog).findByText("Press kit for Northwind")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Revoke" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Revoke this link?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(sent).toEqual([{ method: "DELETE", url: "/api/v1/shares/shr_press", body: null }]));
  },
});

/** Request uploads, with nothing picked yet: where the files go comes first, and Make link waits for it. */
export const RequestUploads = meta.story({
  args: { target: { kind: "upload" } },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Request uploads" });
    await expect(await within(dialog).findByRole("button", { name: "Make link" })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Files go into" }));
    await userEvent.click(await screen.findByRole("option", { name: "Autumn campaign" }));
    await userEvent.click(await within(dialog).findByRole("button", { name: "Make link" }));
    await waitFor(() => expect(sent[0]?.body).toEqual({ kind: "upload", collection: "col_campaign", name: "Uploads for Autumn campaign" }));
  },
});

/** The organization can't send email: copy the link instead, and an admin is offered to turn it on. */
export const EmailOff = meta.story({
  parameters: { app: { me: { email: false } } },
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await expect(within(dialog).getByLabelText("Send it to")).toBeDisabled();
    await expect(within(dialog).getByRole("link", { name: "Turn it on" })).toBeInTheDocument();
  },
});

/** Share links turned off in Settings, Features: said, rather than a form the API would refuse. */
export const SharesOff = meta.story({
  parameters: { app: { me: { off: ["shares"] } } },
  play: async () => {
    const dialog = await screen.findByRole("dialog");
    await expect(within(dialog).getByText(/Share and upload links are turned off in Acme/)).toBeInTheDocument();
  },
});

/** An editor who may not list links: no existing links, just the form. */
export const Editor = meta.story({
  parameters: { app: { scope: "write" } },
  args: { target: { kind: "view", collection: { id: "col_press", name: "Press" } } },
});

/** A name too long for a title. */
export const LongName = meta.story({
  args: { target: { kind: "view", asset: { id: "ast_long", name: "Acme and Northwind co-branded retail window display, print-ready, final approved version", shareable: true } } },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

/** Send an existing link to more people (SendLinkDialog, from Team's list of links). */
export const SendLink = meta.story({
  render: () => <SendLinkDialog link={shareLink({ password: true })} onClose={fn()} />,
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Send Press kit for Northwind" });
    await userEvent.type(within(dialog).getByLabelText("Email addresses"), "lena@northwind.test");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    await expect(await within(dialog).findByText("Sent to 1 person.")).toBeInTheDocument();
  },
});

/** Request uploads in the app, as artbucket.io's solution pages frame it: a link made for Autumn campaign, nothing typed. */
export const RequestUploadsInTheApp = RequestUploads.extend({
  decorators: [inApp],
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/collections" } } },
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Request uploads" });
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Files go into" }));
    await userEvent.click(await screen.findByRole("option", { name: "Autumn campaign" }));
    await userEvent.click(await within(dialog).findByRole("button", { name: "Make link" }));
    await waitFor(() => expect(sent[0]?.body).toEqual({ kind: "upload", collection: "col_campaign", name: "Uploads for Autumn campaign" }));
    // Framed, the button clicked last would keep its focus ring.
    (document.activeElement as HTMLElement | null)?.blur();
  },
});
