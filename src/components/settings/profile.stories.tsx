import preview from "#.storybook/preview";
import { http, HttpResponse } from "msw";
import { expect, screen, waitFor } from "storybook/test";
import { me, withMe } from "#.storybook/fixtures/brands";
import { ProfilePanel } from "@/components/settings/panels";

/** better-auth's endpoints (not /api/v1): what each was sent. */
let sent: { path: string; body: unknown }[] = [];
const auth = (status = 200, message?: string) =>
  http.post("/api/auth/*", async ({ request }) => {
    sent.push({ path: new URL(request.url).pathname, body: await request.json() });
    return status < 400 ? HttpResponse.json({ status: true }) : HttpResponse.json({ message }, { status });
  });

const meta = preview.meta({
  title: "App/Features/Settings/Profile",
  component: ProfilePanel,
  args: { me, passwordReset: true },
  decorators: [withMe(me)],
  beforeEach: () => void (sent = []),
});

/** Your name, and your password: each form says its own errors under itself. */
export const Playground = meta.story({
  beforeEach: ({ msw }) => void msw.use(auth()),
  play: async ({ canvas, userEvent }) => {
    const name = canvas.getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Ada King");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ path: "/api/auth/update-user", body: { name: "Ada King" } }));
    await expect(await canvas.findByText("Name saved")).toBeInTheDocument();
  },
});

/** A new password signs you out everywhere else. */
export const ChangePassword = meta.story({
  beforeEach: ({ msw }) => void msw.use(auth()),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Current password"), "old-password-1");
    await userEvent.type(canvas.getByLabelText("New password"), "a-much-longer-one");
    await userEvent.click(canvas.getByRole("button", { name: "Change password" }));
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({ path: "/api/auth/change-password", body: { currentPassword: "old-password-1", newPassword: "a-much-longer-one", revokeOtherSessions: true } }),
    );
    await expect(await screen.findByText("Password changed")).toBeInTheDocument();
  },
});

/** The current password is wrong: said under the form, as an alert. */
export const WrongPassword = meta.story({
  beforeEach: ({ msw }) => void msw.use(auth(400, "Invalid password")),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Current password"), "not-it-at-all");
    await userEvent.type(canvas.getByLabelText("New password"), "a-much-longer-one");
    await userEvent.click(canvas.getByRole("button", { name: "Change password" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Invalid password");
  },
});

/** A server without email: no reset for a forgotten password, so it says to keep it safe. */
export const NoReset = meta.story({ args: { passwordReset: false } });

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });
