import preview from "#.storybook/preview";
import { expect, screen, waitFor } from "storybook/test";
import { me, recorder, viewer, withMe } from "#.storybook/fixtures/brands";
import { EmailPanel, type EmailSetting } from "@/components/settings/email";

const sent = recorder();
const off: EmailSetting = {
  value: { enabled: false, provider: "console", from: "", replyTo: null, apiKey: null },
  secrets: { apiKey: false },
  source: "default",
  sources: {},
  own: false,
};
const on: EmailSetting = {
  value: { enabled: true, provider: "resend", from: "Acme <assets@acme.test>", replyTo: "brand@acme.test", apiKey: null },
  secrets: { apiKey: true },
  source: "organization",
  sources: { enabled: "organization", provider: "organization", from: "organization", replyTo: "environment", apiKey: "organization" },
  own: true,
};

const meta = preview.meta({
  title: "App/Features/Settings/Email sending",
  component: EmailPanel,
  args: { me, setting: on },
  decorators: [withMe(me)],
  beforeEach: () => sent.reset(),
});

/** Set up for the organization, its reply-to from the server's configuration, the key kept. */
export const Playground = meta.story({});

/** Not configured: invitations are links to send by hand until it is. Turning it on sends only what changed. */
export const NotConfigured = meta.story({
  args: { setting: off },
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/settings/:key", { value: { ...on.value } })),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("button", { name: "Send a test" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("switch", { name: "Send email from Acme" }));
    await expect(canvas.getByText("Not saved yet")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("combobox", { name: "Provider" }));
    await userEvent.click(await screen.findByRole("option", { name: "Resend" }));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await userEvent.type(canvas.getByLabelText("From"), "Acme <assets@acme.test>");
    await userEvent.type(canvas.getByLabelText("API key"), "re_test_123");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(sent.last("PATCH")).toEqual({
        path: "/api/v1/settings/email?context=organization",
        body: { enabled: true, provider: "resend", from: "Acme <assets@acme.test>", apiKey: "re_test_123" },
      }),
    );
    await expect(await screen.findByText("Email is on")).toBeInTheDocument();
  },
});

/** The provider refused the key: the API's message, and the form keeps what was typed. */
export const SaveFails = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/settings/:key", { code: "invalid", message: "Resend refused that API key" }, 422)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("API key"), "re_wrong");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await screen.findByText("Resend refused that API key")).toBeInTheDocument();
    await expect(canvas.getByLabelText("API key")).toHaveValue("re_wrong");
  },
});

/** A test goes to you, through what is saved. */
export const SendTest = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/email/test", { sent: true, to: "ada@acme.test" })),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Send a test" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/email/test", body: {} }));
    await expect(await screen.findByText("Sent to ada@acme.test")).toBeInTheDocument();
  },
});

/** Back to the server's settings: asks, then drops the organization's own. */
export const UseServers = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("delete", "/api/v1/settings/:key", {})),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Use the server's settings" }));
    await userEvent.click(await screen.findByRole("button", { name: "Use the server's" }));
    await waitFor(() => expect(sent.last("DELETE")?.path).toBe("/api/v1/settings/email?context=organization"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(), { timeout: 5000 });
  },
});

/** Not an organization admin: read-only, and why. */
export const Viewer = meta.story({
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Only the organization's admins can change this.")).toBeInTheDocument();
    await expect(canvas.getByLabelText("From")).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Send a test" })).toBeDisabled();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
