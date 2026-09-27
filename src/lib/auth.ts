import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { maySignUp, signedIn, welcome } from "@/lib/core/people";

/**
 * Who someone is: better-auth, mounted at /api/auth. Email and password, and
 * any OpenID Connect provider when OIDC_* is set. Single sign-on is not a paid
 * tier here, and never will be.
 *
 * What someone may do is not better-auth's business: that is `grants`
 * (lib/core/people.ts), read by lib/core/access.ts on every request.
 *
 * Sign-up is closed but for three doors: the first account on a fresh install
 * (which becomes the admin of everything), someone holding an invitation, and
 * anyone the OIDC provider vouches for, who arrives with no access until an
 * admin grants some.
 */

export const OIDC_PROVIDER = "oidc";
export const oidc = env.OIDC_ISSUER ? { provider: OIDC_PROVIDER, name: env.OIDC_NAME } : null;

const cookieOf = (headers: Headers | undefined) => headers?.get("cookie") ?? null;

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  telemetry: { enabled: false },
  plugins: [
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
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          const viaOidc = ctx?.path?.startsWith("/callback/") ?? false;
          if (!(await maySignUp(cookieOf(ctx?.headers), viaOidc))) {
            throw new APIError("FORBIDDEN", { message: "Accounts here are by invitation. Ask an admin for a link." });
          }
        },
        after: async (user, ctx) => welcome(user, cookieOf(ctx?.headers)),
      },
    },
    session: { create: { after: async (session) => signedIn(session) } },
  },
});
