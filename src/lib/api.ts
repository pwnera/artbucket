import { NextResponse } from "next/server";
import { z } from "zod";
import { AssetError } from "@/lib/core/errors";
import { callerFrom, type Caller } from "@/lib/core/access";
import { isAppOrigin } from "@/lib/core/domains";
import { OAuthError } from "@/lib/core/oauth";
import { hasUsers } from "@/lib/core/people";
import { env } from "@/lib/env";
import { formFields } from "@/lib/oauth";
import { ACTIONS, can, needs, type Action } from "@/lib/permissions";
import { brandTarget } from "@/lib/core/brands";
import { refusedValue } from "@/lib/refused";

export const ok = <T>(data: T, init?: ResponseInit) => NextResponse.json(data, init);

export const fail = (status: number, code: string, message: string, extra?: unknown, headers?: HeadersInit) =>
  NextResponse.json({ error: { code, message, ...(extra ? { detail: extra } : {}) } }, { status, headers });

const STATUS: Record<AssetError["code"], number> = {
  not_found: 404,
  too_large: 413,
  unsupported: 415,
  invalid: 422,
  conflict: 409,
  forbidden: 403,
  gone: 410,
  password: 401,
  limit_reached: 403,
  read_only: 403,
  suspended: 451,
  rate_limited: 429,
  unavailable: 503,
};

/** One place that turns thrown errors into the API's error shape. */
export function handle(err: unknown) {
  if (err instanceof AssetError) return fail(STATUS[err.code], err.code, err.message, err.detail);
  if (err instanceof z.ZodError) return fail(400, "invalid_request", "Invalid request body", z.treeifyError(err));
  if (err instanceof SyntaxError) return fail(400, "invalid_request", "Body is not valid JSON");
  const refused = refusedValue(err);
  if (refused === "invalid") return fail(400, "invalid_request", "A value holds a character that can't be stored (a NUL)");
  if (refused === "not_found") return fail(404, "not_found", "Not found");
  if (refused === "empty") return fail(400, "invalid_request", "Nothing to change: send at least one field");
  // Races, not mistakes: logged, so one that keeps happening (a broken unique index) still shows.
  if (refused === "conflict" || refused === "retry") console.warn(err);
  if (refused === "conflict") return fail(409, "conflict", "That name, slug or key was just taken by another change: pick another, or try again");
  if (refused === "retry") return fail(409, "conflict", "Another change crossed this one: try again");
  console.error(err);
  return fail(500, "internal_error", "Something went wrong");
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  return schema.parse(await req.json());
}

/**
 * What a route needs: an action (lib/permissions.ts), asked without a
 * target, so a caller with it on part of the workspace gets in and core
 * checks the thing itself. `null` lets in anyone who is somebody, or nobody:
 * core decides (people, invitations, settings).
 */
export type Need = Action | null;

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Resolve the caller and check its scope. Returns the caller, or the response
 * to send instead: 401 when a key is missing or unknown, 403 when a real key
 * or a signed-in person lacks the scope.
 */
export async function authorize(req: Request, need: Need): Promise<Caller | Response> {
  // Cookies ride along on any request a browser makes, so a page elsewhere
  // could write here as whoever is signed in. Browsers always send Origin on
  // these requests; nothing without cookies (a key, a CLI) needs it. The
  // app's own origins: APP_URL, and organizations' verified domains.
  if (!SAFE.has(req.method) && !req.headers.has("authorization")) {
    const origin = req.headers.get("origin");
    if (origin && !(await isAppOrigin(origin))) return fail(403, "forbidden", "Cross-origin requests are refused");
  }
  const caller = await callerFrom(req);
  // resource_metadata: how an MCP client finds where to send its person to sign in (RFC 9728).
  const metadata = `resource_metadata="${env.APP_URL}/.well-known/oauth-protected-resource/api/v1/mcp"`;
  const challenge = { "WWW-Authenticate": `Bearer realm="artbucket", ${metadata}` };
  // RFC 6750: a token that was sent and doesn't work, which tells an agent to renew it (or connect again).
  if (!caller) return fail(401, "unauthorized", "Unknown or expired API key", undefined, { "WWW-Authenticate": `Bearer realm="artbucket", error="invalid_token", ${metadata}` });
  if (need === null) return caller;
  // A fresh install does one thing: make its first account, which is its admin. Keys from before wait too.
  if (!(await hasUsers())) {
    return fail(403, "setup_required", `Nobody has an account yet. Make the first one at ${env.APP_URL}/login`);
  }
  if (can(caller, need)) {
    // About one brand: the action on that brand, which a grant on it or its being private changes (lib/access.ts).
    if (ACTIONS[need].on !== "brand") return caller;
    const brand = await brandTarget(caller.workspace.id, new URL(req.url));
    if (!brand || can(caller, need, brand)) return caller;
    // A private brand they can't read isn't there, for them.
    if (!can(caller, "brand.read", brand)) return fail(404, "not_found", "Not found");
    return fail(403, "forbidden", `You need ${needs(need)} on this brand`);
  }
  if (caller.readOnly) return fail(403, "read_only", "This organization is read-only");
  if (caller.key) return fail(403, "forbidden", `This key's scope is ${caller.scope}; this needs ${needs(need)}`);
  if (caller.user) return fail(403, "forbidden", `You need ${needs(need)} in ${caller.workspace.name}`);
  return fail(401, "unauthorized", `Sign in, or send an API key with ${needs(need)}`, undefined, challenge);
}

/**
 * Every /api/v1 handler: check the scope, run, map errors. Handlers return a
 * Response, or `null` for a 404 with the given message.
 */
export function route<P = object>(
  need: Need,
  fn: (req: Request, params: P, caller: Caller) => Promise<Response | null>,
  missing = "Not found",
) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      const caller = await authorize(req, need);
      if (caller instanceof Response) return caller;
      return (await fn(req, await ctx.params, caller)) ?? fail(404, "not_found", missing);
    } catch (err) {
      return handle(err);
    }
  };
}

const NO_STORE = { "Cache-Control": "no-store" };

/** A form post the OAuth way, or JSON, as a flat record of strings. */
export async function form(req: Request): Promise<Record<string, string>> {
  if (req.headers.get("content-type")?.includes("application/json")) return formFields(await req.json());
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

/** The OAuth endpoints clients call (lib/core/oauth.ts): errors are `{error, error_description}`, nothing is cached. */
export function oauth(fn: (req: Request) => Promise<unknown>, status = 200) {
  return async (req: Request) => {
    try {
      return NextResponse.json(await fn(req), { status, headers: NO_STORE });
    } catch (err) {
      if (err instanceof OAuthError) {
        return NextResponse.json({ error: err.error, error_description: err.message }, { status: err.status, headers: NO_STORE });
      }
      // Bad JSON, a NUL, a value Postgres refuses: still the caller's mistake, in the OAuth shape (RFC 6749 5.2).
      const res = handle(err);
      if (res.status >= 500) return res;
      const { error } = (await res.json()) as { error: { message: string } };
      return NextResponse.json({ error: "invalid_request", error_description: error.message }, { status: 400, headers: NO_STORE });
    }
  };
}
