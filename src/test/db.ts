/**
 * The harness of `pnpm test:db`, preloaded (--import) into each
 * `*.db.test.ts`'s process before the file loads:
 *
 * - resolves imports the way Next's bundler does, so tests reach the app's
 *   own modules (lib/core, lib/db) under plain Node: `@/` is src/, an import
 *   in src/ may leave out `.ts` or `/index.ts`, and `next/server` is
 *   `next/server.js` (next has no exports map)
 * - makes the test file a database of its own on the server DATABASE_URL
 *   names, migrated as the server would on start, and drops it after. The
 *   database DATABASE_URL names is never written to, only used to make others.
 *   .env is not read: the tests describe a server of their own
 * - sets the environment of the server the tests describe: open sign-up, no
 *   email of its own (so no sign-up code), no setup token or anonymous scope,
 *   no limits but an organization's own row, and files in a bucket of their
 *   own, artbucket-test, on S3_ENDPOINT (docker-compose.yml's SeaweedFS unset)
 *
 * Set up here rather than imported by the tests: the app's modules read the
 * environment as they load, and a test file's imports load together.
 *
 *   pnpm services && DATABASE_URL=postgres://artbucket:artbucket@localhost:5433/artbucket pnpm test:db
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import postgres from "postgres";

const SRC = new URL("../", import.meta.url);

registerHooks({
  resolve(specifier, context, next) {
    if (!specifier.startsWith("@/") && !context.parentURL?.startsWith(SRC.href)) return next(specifier, context);
    const local = specifier.startsWith("@/") ? new URL(specifier.slice(2), SRC).href : specifier.startsWith(".") ? new URL(specifier, context.parentURL).href : null;
    if (local) {
      const file = fileURLToPath(local);
      const found = ["", ".ts", "/index.ts"].find((ext) => existsSync(file + ext) && (ext || /\.\w+$/.test(file)));
      if (found !== undefined) return next(pathToFileURL(file + found).href, context);
    }
    if (specifier.startsWith("next/") && !/\.\w+$/.test(specifier)) return next(`${specifier}.js`, context);
    return next(specifier, context);
  },
});

const server = process.env.DATABASE_URL;
if (!server) throw new Error("Set DATABASE_URL to a Postgres server the tests may make databases on (pnpm services)");
const env: Record<string, string> = {
  S3_ENDPOINT: "http://localhost:9000",
  S3_ACCESS_KEY_ID: "artbucket",
  S3_SECRET_ACCESS_KEY: "artbucket",
  APP_URL: "http://localhost:3000",
};
for (const [k, v] of Object.entries(env)) process.env[k] ??= v;
for (const k of Object.keys(process.env)) if (/^(EMAIL_|LIMIT_)|^(SETUP_TOKEN|ANONYMOUS_SCOPE|SIGNUP_CAPTCHA)$/.test(k)) delete process.env[k];
process.env.SIGNUP = "open";
process.env.S3_BUCKET = "artbucket-test";

const name = `artbucket_test_${process.pid}_${Date.now().toString(36)}`;
const admin = postgres(server, { max: 1, onnotice: () => {} });
await admin.unsafe(`create database ${name}`);
const url = new URL(server);
url.pathname = `/${name}`;
process.env.DATABASE_URL = url.href;

const [{ migrateOnStart }, { env: read }] = await Promise.all([import("@/lib/db/migrate"), import("@/lib/env")]);
if (read.DATABASE_URL !== url.href) throw new Error("The app read DATABASE_URL before the test database was made");
await migrateOnStart();

after(async () => {
  const { db } = await import("@/lib/db");
  await db.$client.end();
  await admin.unsafe(`drop database ${name} with (force)`);
  await admin.end();
});

/** Someone signs up with a password, as the sign-up form does: their session's cookie, and who they are with it. */
export async function signUp(name: string) {
  const [{ auth }, { callerFrom }] = await Promise.all([import("@/lib/auth"), import("@/lib/core/access")]);
  const email = `${name.toLowerCase()}@example.com`;
  const res = await auth.api.signUpEmail({ body: { name, email, password: "correct horse battery" }, asResponse: true });
  if (!res.ok) throw new Error(`sign-up refused: ${res.status} ${await res.text()}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const caller = await callerFrom(request({ cookie }));
  if (!caller?.user) throw new Error("signed up, but the session doesn't resolve");
  return { cookie, caller, user: caller.user };
}

/** A request to the app, as a route handler gets it. */
export const request = (headers: Record<string, string> = {}, path = "/api/v1/me") => new Request(new URL(path, process.env.APP_URL), { headers });

/** The organization's plan, as an operator (or a billing integration) writes it: its `limits` row, read fresh from here on. */
export async function plan(organizationId: string, limits: Record<string, unknown>) {
  const [{ db }, { settings }, { UNLIMITED }, { effective }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db/schema"),
    import("@/lib/limits"),
    import("@/lib/core/settings"),
  ]);
  await db.insert(settings).values({ organizationId, key: "limits", value: { ...UNLIMITED, ...limits }, updatedBy: "test" });
  await effective("limits", { organizationId }, { fresh: true });
}
