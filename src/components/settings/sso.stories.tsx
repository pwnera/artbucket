import preview from "#.storybook/preview";
import { expect, screen, waitFor } from "storybook/test";
import { me, recorder, viewer, withMe } from "#.storybook/fixtures/brands";
import { SsoPanel, type Sso } from "@/components/settings/sso";

const sent = recorder();
const URIS = ["https://app.artbucket.test/api/auth/sso/callback/acme"];
const projects = [
  { id: "prj_acme", name: "Acme" },
  { id: "prj_northwind", name: "Northwind" },
];
const sso: Sso = {
  issuer: "https://acme.okta.com",
  clientId: "0oa9x2acme",
  domain: "acme.test",
  verified: false,
  required: false,
  projectId: null,
  record: { type: "TXT", name: "_artbucket.acme.test", value: "artbucket-verify=7f3c9e1a" },
  redirectUri: URIS[0]!,
};
const verified: Sso = { ...sso, verified: true };

const meta = preview.meta({
  title: "App/Features/Settings/Single sign-on",
  component: SsoPanel,
  args: { sso: null, redirectUris: URIS, projects: projects.slice(0, 1) },
  decorators: [withMe(me)],
  beforeEach: () => sent.reset(),
});

/** Not set up yet: register the app at the provider, then save its client here. */
export const Playground = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("put", "/api/v1/sso", { ...sso })),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Issuer URL"), "https://acme.okta.com");
    await userEvent.type(canvas.getByLabelText("Client ID"), "0oa9x2acme");
    await userEvent.type(canvas.getByLabelText("Client secret"), "s3cret-value");
    await userEvent.type(canvas.getByLabelText("Email domain"), "acme.test");
    await userEvent.click(canvas.getByRole("button", { name: "Set up" }));
    await waitFor(() =>
      expect(sent.last("PUT")).toEqual({
        path: "/api/v1/sso",
        body: { issuer: "https://acme.okta.com", clientId: "0oa9x2acme", clientSecret: "s3cret-value", domain: "acme.test" },
      }),
    );
    await expect(await screen.findByText("Single sign-on set up")).toBeInTheDocument();
  },
});

/** The provider's issuer doesn't answer: the API's message, as a toast, and the form keeps what was typed. */
export const SaveFails = meta.story({
  beforeEach: ({ msw }) => void msw.use(sent.on("put", "/api/v1/sso", { code: "invalid", message: "The issuer has no OpenID configuration" }, 422)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Issuer URL"), "https://nowhere.acme.test");
    await userEvent.type(canvas.getByLabelText("Client ID"), "abc");
    await userEvent.type(canvas.getByLabelText("Client secret"), "s3cret");
    await userEvent.type(canvas.getByLabelText("Email domain"), "acme.test");
    await userEvent.click(canvas.getByRole("button", { name: "Set up" }));
    await expect(await screen.findByText("The issuer has no OpenID configuration")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Issuer URL")).toHaveValue("https://nowhere.acme.test");
  },
});

/** Saved, its domain not yet proved: the TXT record to add, and Check now. With several projects, where people land. */
export const Unverified = meta.story({
  args: { sso, projects, redirectUris: [...URIS, "https://assets.acme.test/api/auth/sso/callback/acme"] },
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/sso/verify", verified), sent.on("put", "/api/v1/sso", sso)),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("_artbucket.acme.test")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Client secret")).toHaveAttribute("placeholder", "Kept: type a new one to change it");
    await userEvent.click(canvas.getByRole("button", { name: "Check now" }));
    await waitFor(() => expect(sent.last("POST")).toEqual({ path: "/api/v1/sso/verify", body: null }));
    await expect(await screen.findByText("People at acme.test sign in with single sign-on now")).toBeInTheDocument();
    // Saving again keeps the secret (left blank) and names the landing project.
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(sent.last("PUT")?.body).toEqual({ issuer: "https://acme.okta.com", clientId: "0oa9x2acme", domain: "acme.test", projectId: "prj_acme" }),
    );
  },
});

/** The record isn't there yet: the API says so, and Check now stays. */
export const CheckFails = meta.story({
  args: { sso },
  beforeEach: ({ msw }) => void msw.use(sent.on("post", "/api/v1/sso/verify", { code: "not_found", message: "No TXT record at _artbucket.acme.test yet" }, 422)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Check now" }));
    await expect(await screen.findByText("No TXT record at _artbucket.acme.test yet")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Check now" })).toBeEnabled();
  },
});

/** Verified: requiring it signs everyone at the domain out but the admins, so it asks first. */
export const Verified = meta.story({
  args: { sso: verified },
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/sso", { ...verified, required: true })),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Require single sign-on" }));
    await userEvent.click(await screen.findByRole("button", { name: "Require it" }));
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/sso", body: { required: true } }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  },
});

/** Required: passwords can come back, for everyone at the domain. */
export const Required = meta.story({
  args: { sso: { ...verified, required: true } },
  beforeEach: ({ msw }) => void msw.use(sent.on("patch", "/api/v1/sso", verified)),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Allow passwords again" }));
    await waitFor(() => expect(sent.last("PATCH")?.body).toEqual({ required: false }));
    await expect(await screen.findByText("People at acme.test may use a password again")).toBeInTheDocument();
  },
});

/** Turning it off asks, then deletes it. */
export const TurnOff = meta.story({
  args: { sso: verified },
  beforeEach: ({ msw }) => void msw.use(sent.on("delete", "/api/v1/sso", { deleted: true })),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Turn off" }));
    await userEvent.click(await screen.findByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(sent.last("DELETE")).toEqual({ path: "/api/v1/sso", body: null }));
    await expect(await screen.findByText("Single sign-on is off")).toBeInTheDocument();
  },
});

/** Someone who isn't an organization admin: the panel is read-only, and says why. */
export const Viewer = meta.story({
  args: { sso: verified },
  decorators: [withMe(viewer)],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Only the organization's admins can change this.")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Issuer URL")).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
  },
});

export const Phone = meta.story({ args: { sso, projects }, globals: { viewport: { value: "phone" } } });
