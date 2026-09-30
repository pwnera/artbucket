import { z } from "zod";
import { EMAIL_PROVIDERS } from "@/lib/email";
import { limitsFromEnv } from "@/lib/limits";
import { parseAnonymous } from "@/lib/scopes";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  /**
   * Where browsers reach storage, when that isn't where the server does:
   * in Docker Compose the app talks to http://s3:9000, a browser to a public
   * URL. Browser uploads are signed for this one. Unset: S3_ENDPOINT.
   */
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  /**
   * Where the server reaches its own API while rendering a page. Unset:
   * APP_URL. Set it when the server can't reach its public address from
   * inside (a container behind a proxy): http://localhost:3000.
   */
  INTERNAL_URL: z.string().url().optional(),
  /**
   * A Chromium the server may run headless, to draw brand pages as pictures
   * (preview_page): /usr/bin/chromium-browser in the Docker image. Unset:
   * the machine's Google Chrome, or none, and previews say so.
   */
  CHROMIUM_PATH: z.string().min(1).optional(),
  /**
   * The host name an organization's own domain should CNAME to, shown beside
   * its TXT record: this server's, or a hosting provider's (Cloudflare for
   * SaaS's fallback origin). Unset: "point it at this server".
   */
  DOMAIN_TARGET: z.string().regex(/^[a-z0-9.-]+$/i, "A host name, e.g. domains.example.com").optional(),
  /**
   * Where an organization's admins manage the plan behind its limits: a
   * "Manage plan" link in Settings, Usage, and named when a limit refuses
   * something. Unset: limits are simply set by whoever runs this server.
   */
  BILLING_URL: z.string().url().optional(),
  /**
   * A domain whose subdomains are portals: {slug}.PORTAL_DOMAIN serves that
   * portal, with no claim or TXT record, beside /p/{slug}. It takes a wildcard
   * DNS record and certificate. Unset: portals answer at /p/{slug} only.
   */
  PORTAL_DOMAIN: z
    .string()
    .regex(/^[a-z0-9.-]+$/i, "A domain, e.g. portals.example.com")
    .transform((v) => v.toLowerCase().replace(/\.$/, ""))
    .optional(),
  /**
   * Where BrandHub answers (lib/core/hub.ts): every published brand,
   * private to its workspace or public, for people and agents. A host of its
   * own (https://hub.artbucket.io) is served by src/proxy.ts and shows public
   * brands; the app's own /hub shows them too, and private ones to people
   * signed in. On APP_URL's host, it is /hub (http://localhost:3000/hub).
   * Unset: no hub.
   */
  HUB_URL: z
    .string()
    .url()
    .transform((v) => v.replace(/\/+$/, ""))
    .optional(),
  /**
   * What a request without an API key or a session may do, once the first
   * account exists (before, nothing works). Unset: nothing. See lib/scopes.ts.
   */
  ANONYMOUS_SCOPE: z.string().optional().transform((v, ctx) => {
    try {
      return parseAnonymous(v);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: (e as Error).message });
      return z.NEVER;
    }
  }),
  /** Signs sessions. Required in production; `openssl rand -base64 32`. */
  BETTER_AUTH_SECRET: z
    .string()
    .min(32)
    .optional()
    .refine((v) => !!v || process.env.NODE_ENV !== "production", "Set BETTER_AUTH_SECRET in production")
    .transform((v) => v ?? "artbucket-development-secret-not-for-production"),
  /**
   * Who may make an account: `invite` (the default) takes an invitation,
   * `open` lets anyone in, each with an organization of their own.
   */
  SIGNUP: z.enum(["invite", "open"]).default("invite"),
  /** /api requests per minute per client (lib/rate.ts); 0 turns the limit off. */
  RATE_LIMIT: z.coerce.number().int().nonnegative().default(1200),
  /** Single sign-on with any OpenID Connect provider: all three, or none. */
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  /** The sign-in button's label: "Sign in with {OIDC_NAME}". */
  OIDC_NAME: z.string().default("SSO"),
  /**
   * The server's email, for every organization that doesn't set its own in
   * Settings (lib/settings.ts). Unset: no email until an organization turns
   * it on.
   */
  EMAIL_PROVIDER: z.enum(EMAIL_PROVIDERS).optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REPLY_TO: z.email().optional(),
  EMAIL_API_KEY: z.string().optional(),
}).refine(
  (e) => [e.OIDC_ISSUER, e.OIDC_CLIENT_ID, e.OIDC_CLIENT_SECRET].filter(Boolean).length % 3 === 0,
  "Set OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET together, or none of them",
);

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment. Copy .env.example to .env and fill it in.\n${z.prettifyError(parsed.error)}`,
  );
}

// LIMIT_* is read per organization (lib/settings.ts); a typo there should stop the server now, not every upload later.
try {
  limitsFromEnv(process.env);
} catch (e) {
  throw new Error(`Invalid LIMIT_* in the environment.\n${e instanceof z.ZodError ? z.prettifyError(e) : e}`);
}

export const env = parsed.data;
