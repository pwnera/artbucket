import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { appOriginAt } from "@/lib/core/domains";
import { sendPasswordReset, sendSignUpCode } from "@/lib/core/mail";
import { maySignUp, signedIn, welcome } from "@/lib/core/people";
import { joinThroughSso, passwordBarred, providerFor, ssoAt } from "@/lib/core/sso";
import { cookieDomain, expireHostOnly, withoutDomain } from "@/lib/hub";
import { localPath } from "@/lib/markdown";
import { underDomain } from "@/lib/portal";
import { lockedBy } from "@/lib/settings";

/**
 * Who someone is: better-auth, mounted at /api/auth. Email and password, any
 * OpenID Connect provider when OIDC_* is set, and each organization's own
 * (lib/core/sso.ts). Single sign-on is not a paid tier here, and never will be.
 *
 * What someone may do is not better-auth's business: that is `grants`
 * (lib/core/people.ts), read by lib/core/access.ts on every request.
 *
 * Sign-up is closed but for four doors: the first account on a fresh install
 * (which becomes the admin of everything), someone holding an invitation,
 * anyone the OIDC provider vouches for, who arrives with no access until an
 * admin grants some, and anyone at an organization's verified domain its own
 * provider vouches for, who joins it able to read. SIGNUP=open opens it to
 * anyone, each with an organization of their own, but for an address at such
 * a domain: that one signs up through the provider, never with a password.
 */

export const OIDC_PROVIDER = "oidc";
export const oidc = env.OIDC_ISSUER ? { provider: OIDC_PROVIDER, name: env.OIDC_NAME } : null;

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

/** A password refused for an address its organization signs in through its own provider: the form goes there instead. */
const ssoRequired = (email: string) =>
  new APIError("FORBIDDEN", { code: "SSO_REQUIRED", message: `People at ${email.split("@").at(-1)?.toLowerCase()} sign in with single sign-on.` });

export const auth = betterAuth({
  baseURL: env.APP_URL,
  // An organization's verified domain signs in too, with its own cookie: trusted for requests sent to it, and only those.
  // ponytail: single sign-on and reset links still return to APP_URL; a per-host baseURL would fix that.
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
    sendResetPassword: async ({ user, url }) => void ((await passwordBarred(user.email)) || (await sendPasswordReset(user, url))),
    revokeSessionsOnPasswordReset: true,
    requireEmailVerification: verify,
  },
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
  ],
  telemetry: { enabled: false },
  // Single sign-on errors land on the sign-in page, which says so (app/(auth)/login), not on better-auth's own unbranded one.
  onAPIError: { errorURL: "/login" },
  // A session and its person in one query (db/schema.ts relations): every request reads one.
  advanced: { database: { joins: true }, ...(shared ? { crossSubDomainCookies: { enabled: true, domain: shared } } : {}) },
  plugins: [
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
          const viaOidc = ctx?.path?.startsWith("/callback/") ?? false;
          if (!(await maySignUp(cookieOf(ctx?.headers), viaOidc))) {
            throw new APIError("FORBIDDEN", { message: "Accounts here are by invitation. Ask an admin for a link." });
          }
        },
        // Through an organization's provider, the organization is theirs already (joinThroughSso): none of their own.
        after: async (user, ctx) => welcome(user, cookieOf(ctx?.headers), !!ssoCallback(ctx)),
      },
    },
    session: { create: { after: async (session) => signedIn(session) } },
  },
});
