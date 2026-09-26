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
   * What a request without an API key may do. Defaults to everything, which is
   * what a single-user install on localhost wants; see lib/scopes.ts.
   */
  ANONYMOUS_SCOPE: z.string().optional().transform((v, ctx) => {
    try {
      return parseAnonymous(v);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: (e as Error).message });
      return z.NEVER;
    }
  }),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment. Copy .env.example to .env and fill it in.\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = parsed.data;
