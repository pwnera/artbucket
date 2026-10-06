import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import type { BetterAuthPlugin } from "better-auth";
import { captcha } from "better-auth/plugins";
import { emailOTP } from "better-auth/plugins/email-otp";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { appOriginAt } from "@/lib/core/domains";
import { sendPasswordReset, sendSignUpCode } from "@/lib/core/mail";
import { hasUsers, maySignUp, signedIn, welcome } from "@/lib/core/people";
import { joinThroughSso, passwordBarred, providerFor, ssoAt } from "@/lib/core/sso";
import { cookieDomain, expireHostOnly, withoutDomain } from "@/lib/hub";
import { localPath } from "@/lib/markdown";
import { makeChallenge, verifySolution } from "@/lib/pow";
import { underDomain } from "@/lib/portal";
import { lockedBy } from "@/lib/settings";

/**
 * Who someone is: better-auth, mounted at /api/auth. Email and password,
 * Google when GOOGLE_* is set, any OpenID Connect provider when OIDC_* is
 * set, and each organization's own (lib/core/sso.ts). Single sign-on is not a paid tier here, and never will be.
 *
 * What someone may do is not better-auth's business: that is `grants`
 * (lib/core/people.ts), read by lib/core/access.ts on every request.
 *
 * Sign-up is closed but for five doors: the first account on a fresh install
 * (which becomes the admin of everything, so it takes SETUP_TOKEN when that is
 * set), someone holding an invitation,
 * anyone the OIDC provider vouches for, who arrives with no access until an
 * admin grants some (Google is not that provider: it proves an address, the
 * way an email code does, and opens no door of its own), anyone at an organization's verified domain its own
 * provider vouches for, who joins it able to read one workspace, and anyone at a domain an
 * organization proved and opened (lib/core/email-domains.ts), offered to join
 * it once the email code proves the address. SIGNUP=open opens it to anyone,
 * each with an organization of their own, but for those two: an address at a
 * single sign-on domain signs up through the provider, never with a password,
 * and one at an opened domain is offered to join first.
 */

export const OIDC_PROVIDER = "oidc";
export const oidc = env.OIDC_ISSUER ? { provider: OIDC_PROVIDER, name: env.OIDC_NAME } : null;

export const GOOGLE_PROVIDER = "google";
export const google = !!env.GOOGLE_CLIENT_ID;

/**
 * The social provider (Google, OIDC_*) a request came back from, if it did: to
 * APP_URL, or at an organization's domain from APP_URL through the proxy below.
 * ctx.path is the route, not the URL: the provider is its :id.
 */
const socialCallback = (ctx: { path?: string; params?: Record<string, string | undefined> } | null | undefined) =>
  ((ctx?.path === "/callback/:id" || ctx?.path === "/callback/:id/oauth-proxy") && ctx.params?.id) || null;
const viaGoogle = (ctx: Parameters<typeof socialCallback>[0]) => socialCallback(ctx) === GOOGLE_PROVIDER;

/**
 * Google, and the OIDC_* provider, know one redirect URI: APP_URL's. Signing
 * in at an organization's domain goes there and back: APP_URL takes the code
 * and sends the profile on, encrypted with BETTER_AUTH_SECRET for a minute, to
 * the domain, which makes the session with its own cookie (authAt). At
 * APP_URL itself, `currentURL` keeps it out of the way behind a proxy, where
 * the request's own URL is an internal one.
 */
const proxy = (origin: string) => oAuthProxy({ productionURL: env.APP_URL, currentURL: origin });

const cookieOf = (headers: Headers | undefined) => headers?.get("cookie") ?? null;

/** The organization provider a request came back from (lib/core/sso.ts), if it did. */
const ssoCallback = (ctx: { path?: string; params?: Record<string, string | undefined> } | null | undefined) =>
  (ctx?.path?.startsWith("/sso/callback/") && ctx.params?.providerId) || null;

/**
 * With the server's own email (EMAIL_*), an address is proved before its
 * account signs in: a six-digit code, mailed at sign-up and again at a sign-in
 * that hasn't confirmed yet (accounts made before this included). Without it
 * there is nothing to send the code from before an organization exists.
 * Single sign-on needs no code: the provider vouched.
 */
const verify = lockedBy("email", process.env);

/**
 * Where better-auth may send someone after a step (a reset link, single
 * sign-on, a confirmed address): a path on this server, never another origin.
 * A verified organization domain is not trusted for this: its owner could
 * have a reset link carry someone else's token there.
 */
const REDIRECTS = ["redirectTo", "callbackURL", "errorCallbackURL", "newUserCallbackURL"];

/**
 * With BrandHub on a host beside APP_URL's (hub. and app.example.com), the
 * session cookie is set for the domain they share, so signing in to the app
 * signs in on the hub. An organization's own domain is not under it: a
 * cookie naming it would be refused there, so the Domain comes off again
 * for any host it does not cover, and that host keeps a cookie of its own.
 */
const shared = cookieDomain(env.APP_URL, env.HUB_URL);

/**
 * Making an account with a password, and sending its email code, take a check
 * against scripted sign-ups, its answer in the x-captcha-response header
 * (components/sign-in.tsx). Not signing in, nor a reset, nor a provider's
 * sign-up: the provider vouched. Which check depends on the address the app
 * answers at: Cloudflare Turnstile at APP_URL's when TURNSTILE_* is set (its
 * widget knows the hosts it may run on); anywhere else then, and everywhere
 * with SIGNUP_CAPTCHA=pow, a proof of work of our own (lib/pow.ts). Else none.
 */
const CAPTCHA_PATHS = ["/sign-up/email", "/email-otp/send-verification-otp"];
const appOrigin = new URL(env.APP_URL).origin;
export const captchaAt = (origin: string) =>
  env.TURNSTILE_SECRET_KEY && origin === appOrigin ? "turnstile" : env.TURNSTILE_SECRET_KEY || env.SIGNUP_CAPTCHA === "pow" ? "pow" : null;
/** The check at a host a request came to: its own if it is an organization's domain for the app (authAt), else APP_URL's. */
export const captchaAtHost = async (host: string | null | undefined) => captchaAt((await appOriginAt(host))[0] ?? appOrigin);

/**
 * Where a request was sent, as a session records it (sessions.origin): an
 * organization's domain for the app, else APP_URL's origin, which BrandHub's
 * host shares (its cookie is the app's, cookieDomain). A session is good at
 * its own only: one made at an organization's domain, sent to APP_URL or to
 * another's, is no session there.
 */
const originAt = async (headers: Headers | undefined) => (await appOriginAt(headers?.get("x-forwarded-host") ?? headers?.get("host")))[0] ?? appOrigin;
const withoutCookie = (header: string | null, name: string) =>
  (header ?? "")
    .split(/;\s*/)
    .filter((c) => c && c.split("=")[0] !== name)
    .join("; ");

/** The path under /api/auth, as better-auth routes it: `//sign-up/email/` is `/sign-up/email`. */
const authPath = (url: string) => `/${new URL(url).pathname.replace(/^\/api\/auth/, "").replace(/\/{2,}/g, "/").replace(/^\/|\/$/g, "")}`;

// Its own key, made from BETTER_AUTH_SECRET: a signature here is good for nothing else.
const POW_KEY = `${env.BETTER_AUTH_SECRET}:signup-pow`;

/** GET /api/auth/captcha/challenge hands out a challenge; the guarded calls take its solution. */
const pow = {
  id: "captcha",
  onRequest: async (req: Request) => {
    const path = authPath(req.url);
    if (path === "/captcha/challenge" && req.method === "GET") {
      return { response: Response.json(await makeChallenge(POW_KEY), { headers: { "Cache-Control": "no-store" } }) };
    }
    if (!CAPTCHA_PATHS.includes(path)) return;
    const answer = req.headers.get("x-captcha-response");
    const why = answer ? await verifySolution(POW_KEY, answer) : "missing";
    if (!why) return;
    return {
      response: Response.json(
        why === "missing" ? { code: "MISSING_RESPONSE", message: "Missing CAPTCHA response" } : { code: "VERIFICATION_FAILED", message: "Captcha verification failed" },
        { status: why === "missing" ? 400 : 403 },
      ),
    };
  },
} satisfies BetterAuthPlugin;

const captchaFor = (origin: string): BetterAuthPlugin[] => {
  const kind = captchaAt(origin);
  if (kind === "pow") return [pow];
  return kind === "turnstile" ? [captcha({ provider: "cloudflare-turnstile", secretKey: env.TURNSTILE_SECRET_KEY!, endpoints: CAPTCHA_PATHS })] : [];
};

/** A link better-auth made, on APP_URL instead of the host it was made at. */
const onApp = (url: string) => {
  const u = new URL(url);
  return `${env.APP_URL}${u.pathname}${u.search}`;
};

/** A password refused for an address its organization signs in through its own provider: the form goes there instead. */
const ssoRequired = (email: string) =>
  new APIError("FORBIDDEN", { code: "SSO_REQUIRED", message: `People at ${email.split("@").at(-1)?.toLowerCase()} sign in with single sign-on.` });

export const auth = betterAuth({
  baseURL: env.APP_URL,
  // An organization's verified domain signs in too, with its own cookie: trusted for requests sent to it, and only those.
  // It has an instance of its own (authAt), so single sign-on comes back there.
  trustedOrigins: (req) => appOriginAt(req?.headers.get("x-forwarded-host") ?? req?.headers.get("host")),
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      for (const k of REDIRECTS) {
        const v = ctx.body?.[k] ?? ctx.query?.[k];
        if (v !== undefined && v !== "" && !localPath(v)) throw new APIError("FORBIDDEN", { message: `${k} must be a path on this server` });
      }
      const email = ctx.body?.email;
      if (typeof email === "string") {
        // An address at an organization's verified domain signs up through its provider, and so joins it. Here, not in
        // user.create: with email codes on, better-auth answers a refused sign-up as if it went, and the form would wait for a code.
        if (ctx.path === "/sign-up/email" && (await ssoAt(email))) throw ssoRequired(email);
        // Held to its organization's provider: the same answer whether or not the account exists.
        if (ctx.path === "/sign-in/email" && (await passwordBarred(email))) throw ssoRequired(email);
      }
      // Every endpoint, getSession included: a session cookie made at another origin is dropped before anything reads it.
      const name = ctx.context.authCookies.sessionToken.name;
      const token = await ctx.getSignedCookie(name, ctx.context.secret);
      if (token) {
        const [s] = await db.select({ origin: schema.sessions.origin }).from(schema.sessions).where(eq(schema.sessions.token, token));
        if (s && (s.origin ?? appOrigin) !== (await originAt(ctx.headers))) {
          return { context: { headers: new Headers({ cookie: withoutCookie(ctx.headers?.get("cookie") ?? null, name) }) } };
        }
      }
    }),
    // Before the plugins' (nextCookies copies the cookies to Next's from here).
    after: createAuthMiddleware(async (ctx) => {
      const res = ctx.context.responseHeaders;
      const host = ctx.headers?.get("x-forwarded-host") ?? ctx.headers?.get("host") ?? "";
      if (!shared || !res) return;
      const cookies = res.getSetCookie();
      if (!cookies.length) return;
      const under = underDomain(host, shared);
      res.delete("set-cookie");
      for (const c of cookies) {
        if (!under) res.append("set-cookie", withoutDomain(c));
        else {
          // A host-only cookie of the same name, from before the Domain was shared, is sent first and read first: expire it,
          // before the new one (nextCookies keeps the last of a name).
          if (/;\s*domain=/i.test(c)) res.append("set-cookie", expireHostOnly(c));
          res.append("set-cookie", c);
        }
      }
    }),
  },
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    // Only when some email can go out (lib/core/mail.ts); otherwise an admin resets it.
    // Not to an address held to its organization's provider: it signs in there. better-auth answers the same either way.
    // On APP_URL whatever host asked (authAt): a verified domain's owner could point it elsewhere and read the token.
    sendResetPassword: async ({ user, url }) => void ((await passwordBarred(user.email)) || (await sendPasswordReset(user, onApp(url)))),
    revokeSessionsOnPasswordReset: true,
    requireEmailVerification: verify,
  },
  socialProviders: google
    ? { [GOOGLE_PROVIDER]: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, prompt: "select_account" as const } }
    : {},
  emailVerification: { sendOnSignUp: verify, sendOnSignIn: verify, autoSignInAfterVerification: true },
  // Of the email-code plugin, only confirming an address: no passwordless sign-in or reset by code.
  disabledPaths: [
    "/sign-in/email-otp",
    "/email-otp/request-password-reset",
    "/forget-password/email-otp",
    "/email-otp/reset-password",
    "/email-otp/request-email-change",
    "/email-otp/change-email",
    // Of the sso plugin, only signing in and its callback: providers are the organization's, set up through
    // /api/v1/sso by its admins, never through the plugin's own endpoints, which know nothing of grants.
    "/sso/register",
    "/sso/providers",
    "/sso/get-provider",
    "/sso/update-provider",
    "/sso/delete-provider",
    "/sso/request-domain-verification",
    "/sso/verify-domain",
    "/sso/callback",
    "/sso/saml2/sp/metadata",
    // The proxy's old way back, which would land without its provider (socialCallback): the new one is /callback/:id/oauth-proxy.
    "/oauth-proxy-callback",
  ],
  telemetry: { enabled: false },
  // Single sign-on errors land on the sign-in page, which says so (app/(auth)/login), not on better-auth's own unbranded one.
  onAPIError: { errorURL: "/login" },
  session: { additionalFields: { origin: { type: "string", required: false, input: false } } },
  // A session and its person in one query (db/schema.ts relations): every request reads one.
  advanced: { database: { joins: true }, ...(shared ? { crossSubDomainCookies: { enabled: true, domain: shared } } : {}) },
  plugins: [
    ...captchaFor(appOrigin),
    ...(verify
      ? [
          emailOTP({
            overrideDefaultEmailVerification: true,
            disableSignUp: true,
            expiresIn: 600,
            allowedAttempts: 5,
            storeOTP: "hashed",
            // Only codes that confirm an address go out; the plugin's other kinds are switched off above.
            sendVerificationOTP: async ({ email, otp, type }) => void (type === "email-verification" && (await sendSignUpCode(email, otp))),
          }),
        ]
      : []),
    ...(env.OIDC_ISSUER
      ? [
          genericOAuth({
            config: [
              {
                providerId: OIDC_PROVIDER,
                discoveryUrl: `${env.OIDC_ISSUER.replace(/\/$/, "")}/.well-known/openid-configuration`,
                clientId: env.OIDC_CLIENT_ID!,
                clientSecret: env.OIDC_CLIENT_SECRET!,
                scopes: ["openid", "email", "profile"],
                pkce: true,
              },
            ],
          }),
        ]
      : []),
    sso({
      // Signing in refuses a provider whose domain isn't proved yet (lib/core/sso.ts verifySso).
      domainVerification: { enabled: true },
      provisionUser: async ({ user, provider }) => joinThroughSso(user, provider.providerId),
      // Someone who had an account before the provider did joins at their next sign-in through it.
      provisionUserOnEveryLogin: true,
    }),
    proxy(env.APP_URL),
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          const providerId = ssoCallback(ctx);
          if (providerId) {
            // The organization's provider vouches for its own domain only; the address is proved by it, no code.
            if (!(await providerFor(providerId, user.email))) {
              // With a code, the plugin sends them back to the sign-in page rather than showing this bare.
              throw new APIError("FORBIDDEN", { code: "SSO_OUTSIDE_DOMAIN", message: `This sign-in is for addresses at the organization's own domain, not ${user.email}.` });
            }
            return { data: { ...user, emailVerified: true } };
          }
          // Held to its organization's provider, as a password is: Google would walk around it.
          if (viaGoogle(ctx) && (await ssoAt(user.email))) throw ssoRequired(user.email);
          // The operator's own provider only: Google vouches for anyone with an address.
          const viaOidc = socialCallback(ctx) === OIDC_PROVIDER;
          if (!(await maySignUp(cookieOf(ctx?.headers), viaOidc, user.email))) {
            // First run without the setup token. Not a 403: with email codes on, better-auth answers that as if the account were made.
            if (!(await hasUsers())) throw new APIError("UNAUTHORIZED", { code: "SETUP_TOKEN", message: "That isn't this server's setup token (SETUP_TOKEN)." });
            throw new APIError("FORBIDDEN", { message: "Accounts here are by invitation. Ask an admin for a link." });
          }
        },
        // Through an organization's provider, the organization is theirs already (joinThroughSso): none of their own.
        after: async (user, ctx) => welcome(user, cookieOf(ctx?.headers), !!ssoCallback(ctx)),
      },
    },
    session: {
      create: {
        before: async (session, ctx) => {
          // An account that exists, signing in with Google: refused where a password would be.
          if (viaGoogle(ctx)) {
            const [u] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, session.userId));
            if (u && (await passwordBarred(u.email))) throw ssoRequired(u.email);
          }
          return { data: { ...session, origin: await originAt(ctx?.headers) } };
        },
        after: async (session) => signedIn(session),
      },
    },
  },
});

/**
 * better-auth at the host a request was sent to: `auth` itself, at APP_URL,
 * but at an organization's verified app domain an instance whose baseURL is
 * that domain, so single sign-on sends the provider back there, where the
 * state cookie was set, and the session lands there too. Without it, the
 * provider came back to APP_URL, which had no state cookie (state_mismatch).
 */
// ponytail: one instance per domain used for the app, kept for the process; fine for hundreds.
const atHost = new Map<string, typeof auth>();
export async function authAt(host: string | null | undefined) {
  const [origin] = await appOriginAt(host);
  if (!origin) return auth;
  let a = atHost.get(origin);
  if (!a) {
    // Its own check too: Turnstile's widget runs at APP_URL only (captchaAt).
    const plugins = auth.options.plugins.flatMap((p) => (p.id === "oauth-proxy" ? [proxy(origin)] : p.id === "captcha" ? captchaFor(origin) : [p])) as typeof auth.options.plugins;
    atHost.set(origin, (a = betterAuth({ ...auth.options, baseURL: origin, plugins }) as typeof auth));
  }
  return a;
}
