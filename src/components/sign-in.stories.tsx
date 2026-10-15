import preview from "#.storybook/preview";
import { CODE, auth, betterAuth, invitation, refuse } from "#.storybook/fixtures/account";
import { me, freezeNow } from "#.storybook/fixtures/brands";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { delay, http, HttpResponse } from "msw";
import { expect, screen, waitFor } from "storybook/test";
import { ForgotPassword, InvitePage, ResetPassword, SignInPage, Unreachable, Unsubscribe, Welcome } from "@/components/sign-in";

/** better-auth as this story answers it: made fresh before each story. */
let api = betterAuth();
/** This story's own answers, in its beforeEach (which runs after the meta's). */
const answer = (answers: Parameters<typeof api.set>[0]) => api.set(answers);
/** NewCode's clock, running fast while true. */
let fast = false;

const email = () => screen.getByRole("textbox", { name: "Email" });
const password = () => screen.getByLabelText("Password", { selector: "input" });

/** The email step, then on to the password: what every way of signing in with email starts with. */
async function toPassword(userEvent: { type: (el: Element, text: string) => Promise<void>; click: (el: Element) => Promise<void> }, address = "dana@acme.test") {
  await userEvent.type(email(), address);
  await userEvent.click(screen.getByRole("button", { name: "Continue with email" }));
  await waitFor(() => expect(password()).toHaveFocus());
}

/**
 * /login: the email first, then the password (or, making an account, a name and a password, then the code mailed to
 * it). Google, the server's own single sign-on and an organization's (found by the email's domain) sit beside it.
 * Errors are better-auth's codes said as what to do next, under the form, as an alert.
 */
const meta = preview.meta({
  title: "App/Features/Auth/Sign in",
  component: SignInPage,
  args: { auth: auth(), next: undefined, error: false, up: false },
  parameters: { layout: "fullscreen" },
  beforeEach: ({ msw }) => {
    api = betterAuth();
    msw.use(api.handler);
    try {
      sessionStorage.removeItem("ab:email");
    } catch {}
    // A provider "sends them away" to a hash: put the address back as it was.
    const at = location.href;
    return () => history.replaceState(history.state, "", at);
  },
});

/** Email, password, signed in: the page it came for loads (`/` here). */
export const Playground = meta.story({
  play: async ({ userEvent }) => {
    await toPassword(userEvent);
    // The address stays in sight, with a way back to change it.
    await expect(screen.getByText("dana@acme.test")).toBeVisible();
    await userEvent.type(password(), "correct horse battery");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/"));
    await expect(api.last("sign-in/email")).toEqual({ email: "dana@acme.test", password: "correct horse battery" });
  },
});

/** A wrong password: said under the form, the password marked and selected for the next try. */
export const WrongPassword = meta.story({
  beforeEach: () => void answer({ "sign-in/email": refuse("INVALID_EMAIL_OR_PASSWORD", 401) }),
  play: async ({ userEvent }) => {
    await toPassword(userEvent);
    await userEvent.type(password(), "not it");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await expect(await screen.findByRole("alert")).toHaveTextContent("That email and password don't match. Check both and try again.");
    await expect(password()).toHaveAttribute("aria-invalid", "true");
    await expect(password()).toHaveFocus();
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
});

/** Too many tries: better-auth's own limit says how long to wait. */
export const RateLimited = meta.story({
  beforeEach: () => void answer({ "sign-in/email": refuse("TOO_MANY_REQUESTS", 429, { "X-Retry-After": "42" }) }),
  play: async ({ userEvent }) => {
    await toPassword(userEvent);
    await userEvent.type(password(), "correct horse battery");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await expect(await screen.findByRole("alert")).toHaveTextContent("Too many tries. Wait 42s, then try again.");
  },
});

/** The server didn't answer: offline, or down. */
export const Offline = meta.story({
  beforeEach: () => void answer({ "sign-in/email": () => ({ status: 503, body: {} }) }),
  play: async ({ userEvent }) => {
    await toPassword(userEvent);
    await userEvent.type(password(), "correct horse battery");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await expect(await screen.findByRole("alert")).toHaveTextContent("That didn't work. Try again.");
  },
});

/**
 * An account whose email isn't confirmed yet: a code goes out, and it signs in once entered. A wrong code says so and
 * is selected, so typing the right one replaces it; the sixth digit sends it.
 */
export const EmailCode = meta.story({
  beforeEach: () => void answer({ "sign-in/email": refuse("EMAIL_NOT_VERIFIED", 403) }),
  play: async ({ userEvent }) => {
    await toPassword(userEvent);
    await userEvent.type(password(), "correct horse battery");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    const code = screen.getByRole("textbox", { name: "Code" });
    await waitFor(() => expect(code).toHaveFocus());
    await userEvent.type(code, "654321");
    await expect(await screen.findByRole("alert")).toHaveTextContent("That code isn't right. Check the email and try again.");
    await waitFor(() => expect(code).toHaveFocus());
    // No click first: the wrong code is selected, and typing replaces it.
    await userEvent.type(code, CODE, { skipClick: true });
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/"));
    await expect(api.last("email-otp/verify-email")).toEqual({ email: "dana@acme.test", otp: CODE });
  },
});

/**
 * Making an account instead (sign-up open): a name and a password of ten characters or more, then the code. Pasted
 * with a space it still counts as the six digits it is.
 */
export const SignUp = meta.story({
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: "Make an account" }));
    await expect(screen.getByRole("heading", { name: "Join Artbucket" })).toBeInTheDocument();
    // Going on agrees to the operator's terms.
    await expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "https://acme.test/legal/terms");
    await userEvent.type(email(), "lena@northwind.test");
    await userEvent.click(screen.getByRole("button", { name: "Continue with email" }));
    const name = await screen.findByRole("textbox", { name: "Name" });
    await waitFor(() => expect(name).toHaveFocus());
    await userEvent.type(name, "Lena Park");
    await userEvent.type(password(), "a-long-enough-one");
    await userEvent.click(screen.getByRole("button", { name: "Make account" }));
    await expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    await expect(api.last("sign-up/email")).toEqual({ name: "Lena Park", email: "lena@northwind.test", password: "a-long-enough-one" });
    // Already had one? Sign in instead, from the code step.
    await expect(screen.getByRole("button", { name: "Sign in instead" })).toBeInTheDocument();
    const code = screen.getByRole("textbox", { name: "Code" });
    await userEvent.click(code);
    await userEvent.paste("123 456");
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/"));
  },
});

/** Making an account with an email that has one: said, with Sign in instead, which keeps what was typed. */
export const AccountExists = meta.story({
  args: { up: true },
  beforeEach: () => void answer({ "sign-up/email": refuse("USER_ALREADY_EXISTS", 422) }),
  play: async ({ userEvent }) => {
    await expect(screen.getByRole("heading", { name: "Join Artbucket" })).toBeInTheDocument();
    await userEvent.type(email(), "dana@acme.test");
    await userEvent.click(screen.getByRole("button", { name: "Continue with email" }));
    await userEvent.type(await screen.findByRole("textbox", { name: "Name" }), "Dana Reyes");
    await userEvent.type(password(), "a-long-enough-one");
    await userEvent.click(screen.getByRole("button", { name: "Make account" }));
    const alert = await screen.findByRole("alert");
    await expect(alert).toHaveTextContent("There's already an account with this email.");
    await userEvent.click(screen.getByRole("button", { name: "Sign in instead" }));
    await expect(screen.getByRole("heading", { name: "Sign in to Artbucket" })).toBeInTheDocument();
    await expect(password()).toHaveFocus();
  },
});

/**
 * A new code: better-auth sends three a minute, so the link waits 30 seconds first (the clock runs fast here). Back
 * returns to the form with everything as it was typed.
 */
export const NewCode = meta.story({
  beforeEach: () => {
    answer({ "sign-in/email": refuse("EMAIL_NOT_VERIFIED", 403) });
    // Once `fast`, the cooldown's seconds pass fifty times faster (so would a test's own one-second waits: none follow).
    const real = window.setTimeout;
    window.setTimeout = ((f: TimerHandler, ms?: number, ...rest: unknown[]) => real(f, fast && ms === 1000 ? 20 : ms, ...rest)) as typeof window.setTimeout;
    return () => {
      window.setTimeout = real;
      fast = false;
    };
  },
  play: async ({ userEvent }) => {
    await toPassword(userEvent);
    await userEvent.type(password(), "correct horse battery");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await expect(await screen.findByRole("button", { name: "Send a new code in 30s" })).toBeDisabled();
    fast = true;
    const again = await screen.findByRole("button", { name: "Send a new code" }, { timeout: 5000 });
    fast = false;
    await expect(again).toBeEnabled();
    await userEvent.click(again);
    await expect(await screen.findByRole("status")).toHaveTextContent("A new code is on its way.");
    await expect(api.last("email-otp/send-verification-otp")).toEqual({ email: "dana@acme.test", type: "email-verification" });
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await expect(email()).toHaveValue("dana@acme.test");
    await expect(email()).toHaveFocus();
  },
});

/** Google and the server's own provider (OIDC_*) above the email. Each goes to the provider; it comes back signed in. */
export const Providers = meta.story({
  args: { auth: auth({ google: true, oidc: { name: "Okta" } }) },
  beforeEach: () => void answer({ "sign-in/social": (b) => ({ body: { url: `#${b.provider}` } }) }),
  play: async ({ userEvent }) => {
    await expect(screen.getByRole("button", { name: "Continue with Okta" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(location.hash).toBe("#google"));
    await expect(api.last("sign-in/social")).toMatchObject({ provider: "google", callbackURL: "/", errorCallbackURL: "/login" });
  },
});

/** The provider didn't answer with somewhere to go: said, with the password as the way round. */
export const ProviderDown = meta.story({
  args: { auth: auth({ oidc: { name: "Okta" } }) },
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: "Continue with Okta" }));
    await expect(await screen.findByRole("alert")).toHaveTextContent("Single sign-on isn't answering. Try again, or use your password.");
    await expect(screen.getByRole("button", { name: "Continue with Okta" })).toBeEnabled();
  },
});

/**
 * An organization signs its people in through its own provider, found by the email's domain: northwind.test has none,
 * so on to the password; acme.test has one, so off to it.
 */
export const OrganizationSso = meta.story({
  args: { auth: auth({ sso: true }) },
  beforeEach: () =>
    void answer({ "sign-in/sso": (b) => (String(b.email).endsWith("@acme.test") ? { body: { url: "#acme-sso" } } : refuse("NO_PROVIDER_FOUND", 404)) }),
  play: async ({ userEvent }) => {
    await toPassword(userEvent, "lena@northwind.test");
    await expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    await userEvent.clear(email());
    await userEvent.type(email(), "dana@acme.test");
    await userEvent.click(screen.getByRole("button", { name: "Continue with email" }));
    await waitFor(() => expect(location.hash).toBe("#acme-sso"));
  },
});

/** Back from single sign-on that failed: said from the start. */
export const SsoFailed = meta.story({
  args: { error: true, auth: auth({ oidc: { name: "Okta" } }) },
  play: async () => {
    await expect(screen.getByRole("alert")).toHaveTextContent("Single sign-on didn't finish. Try again, or use your password.");
  },
});

/** Sent here to connect an agent: the lead says so, so it reads as part of what they started. */
export const ForAnAgent = meta.story({
  args: { next: "/oauth/authorize?client_id=claude" },
  play: async () => {
    await expect(screen.getByText("Sign in to connect your agent to Artbucket.")).toBeInTheDocument();
  },
});

/** Accounts by invitation only: no way to make one, and the form says who to ask. */
export const InvitationOnly = meta.story({
  args: { auth: auth({ open: false }) },
  play: async () => {
    await expect(screen.getByText("Accounts are by invitation: ask an admin.")).toBeInTheDocument();
    await expect(screen.queryByRole("button", { name: "Make an account" })).not.toBeInTheDocument();
  },
});

/** A server that can't email: no reset link, so the password step says who can help. */
export const NoPasswordReset = meta.story({
  args: { auth: auth({ passwordReset: false }) },
  play: async ({ userEvent }) => {
    await toPassword(userEvent);
    await expect(screen.queryByRole("link", { name: "Forgot password?" })).not.toBeInTheDocument();
    await expect(screen.getByText(/Ask an admin: this server can't email reset links yet/)).toBeInTheDocument();
  },
});

/** A fresh install: the first account is the admin; it names the organization, and asks for the setup token when set. */
export const FirstRun = meta.story({
  args: { auth: auth({ signUp: true, setupToken: true, open: false }) },
  play: async ({ userEvent }) => {
    await expect(screen.getByRole("heading", { name: "Set up Artbucket" })).toBeInTheDocument();
    await userEvent.type(email(), "dana@acme.test");
    await userEvent.type(screen.getByRole("textbox", { name: "Setup token" }), "s3tup-t0ken");
    await userEvent.click(screen.getByRole("button", { name: "Continue with email" }));
    await expect(await screen.findByRole("textbox", { name: "Organization" })).toBeInTheDocument();
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" }, args: { auth: auth({ google: true, oidc: { name: "Okta" } }) } });

// ---- the other pages outside the app --------------------------------------------------------------------

/** /login when the API didn't answer: a sign-in form would read as signed out. Try again asks the server again. */
export const Unreachable_ = meta.story({
  name: "Unreachable",
  render: () => <Unreachable />,
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await expect(getRouter().refresh).toHaveBeenCalled();
  },
});

/** /welcome: signed in, with no project yet. Make an organization, or wait for an invitation: it moves on by itself. */
export const Welcome_ = meta.story({
  name: "Welcome",
  render: () => <Welcome me={me} />,
  play: async ({ userEvent }) => {
    await expect(screen.getByRole("heading", { name: "Welcome, Ada Lovelace" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Make an organization" }));
    const dialog = await screen.findByRole("dialog", { name: "New organization" });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  },
});

/** /welcome for an address whose domain an organization opened: join it, or start your own. */
export const WelcomeJoin = meta.story({
  render: () => <Welcome me={{ ...me, joinable: { organization: { id: "org_acme", name: "Acme" }, domain: "acme.test" } }} />,
  beforeEach: ({ msw }) => void msw.use(http.post("/api/v1/join", () => HttpResponse.json({ data: {} }))),
  play: async ({ userEvent }) => {
    await expect(screen.getByText("Your acme.test address can join Acme, or start your own.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Join Acme" }));
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled());
  },
});

/**
 * /invite/{token}, signed out: what it offers, then making the account with the address it was sent to. The new
 * account takes the invitation as it is made.
 */
export const Invitation = meta.story({
  render: () => <InvitePage token="inv_acme" info={invitation()} me={null} />,
  beforeEach: freezeNow,
  play: async () => {
    await expect(screen.getByRole("heading", { name: "Join Acme" })).toBeInTheDocument();
    await expect(screen.getByText(/Ada Lovelace invited you to edit/)).toBeInTheDocument();
    await expect(screen.getByText(/Sent to lena@northwind.test · Expires in 6 days/)).toBeInTheDocument();
    await expect(email()).toHaveValue("lena@northwind.test");
  },
});

/** Signed in as someone else than it was sent to: said before accepting, with a way to switch. Accept joins and goes in. */
export const InvitationSignedIn = meta.story({
  render: () => <InvitePage token="inv_acme" info={invitation({ resource: "collection", label: "Autumn campaign" })} me={me} />,
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/v1/invite/:token", async () => {
        await delay(100);
        return HttpResponse.json({ data: { projectId: "prj_acme" } });
      }),
    );
    return freezeNow();
  },
  play: async ({ userEvent }) => {
    await expect(screen.getByRole("heading", { name: "Join Autumn campaign in Acme" })).toBeInTheDocument();
    await expect(screen.getByText("This was sent to lena@northwind.test. You'll join as ada@acme.test.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/"));
    await expect(await screen.findByText("You joined Autumn campaign in Acme")).toBeInTheDocument();
  },
});

/** An invitation used, withdrawn or expired. */
export const InvitationGone = meta.story({
  render: () => <InvitePage token="inv_old" info={null} me={null} />,
  play: async () => {
    await expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  },
});

/** /forgot-password: the answer is the same whether or not the email has an account. */
export const ForgotPassword_ = meta.story({
  name: "Forgot password",
  render: () => <ForgotPassword canSend />,
  play: async ({ userEvent }) => {
    await userEvent.type(email(), "dana@acme.test");
    await userEvent.click(screen.getByRole("button", { name: "Send the link" }));
    await expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    await expect(api.last("request-password-reset")).toEqual({ email: "dana@acme.test", redirectTo: "/reset-password" });
    await expect(screen.getByRole("button", { name: /Send again in \d+s/ })).toBeDisabled();
  },
});

/** A server that can't email: ask an admin instead. */
export const ForgotPasswordNoEmail = meta.story({ render: () => <ForgotPassword canSend={false} /> });

/** /reset-password: the emailed link's page. A new password, then sign in with it. */
export const ResetPassword_ = meta.story({
  name: "Reset password",
  render: () => <ResetPassword token="rst_acme" invalid={false} />,
  play: async ({ userEvent }) => {
    await userEvent.type(screen.getByLabelText("New password", { selector: "input" }), "a-much-longer-one");
    await userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/login"));
    await expect(api.last("reset-password")).toEqual({ newPassword: "a-much-longer-one", token: "rst_acme" });
  },
});

/** The link was used already, or expired. */
export const ResetLinkExpired = meta.story({
  render: () => <ResetPassword token="rst_acme" invalid />,
  play: async () => {
    await expect(screen.getByRole("link", { name: "Send a new link" })).toHaveAttribute("href", "/forgot-password");
  },
});

/** The weekly digest's unsubscribe link: one button, no sign-in. */
export const Unsubscribe_ = meta.story({
  name: "Unsubscribe",
  render: () => <Unsubscribe token="uns_acme" />,
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
    await expect(await screen.findByRole("heading", { name: "You're unsubscribed" })).toBeInTheDocument();
  },
});

/** A link cut short: turn the digest off in Settings instead. */
export const UnsubscribeUnknown = meta.story({
  render: () => <Unsubscribe token="uns_cut" />,
  beforeEach: ({ msw }) => void msw.use(http.post("/api/v1/unsubscribe/:token", () => HttpResponse.json({ error: { message: "Not found" } }, { status: 404 }))),
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
    await expect(await screen.findByRole("heading", { name: "This link doesn't work" })).toBeInTheDocument();
  },
});
