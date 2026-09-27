import { z } from "zod";
import { parseAnonymous } from "@/lib/scopes";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
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
   * What a request without an API key or a session may do. Unset: everything
   * until someone makes an account, which is what a fresh install on
   * localhost wants, then nothing. See lib/scopes.ts.
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
  /** Single sign-on with any OpenID Connect provider: all three, or none. */
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  /** The sign-in button's label: "Sign in with {OIDC_NAME}". */
  OIDC_NAME: z.string().default("SSO"),
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

export const env = parsed.data;
