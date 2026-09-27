import { NextResponse } from "next/server";
import { z } from "zod";
import { AssetError } from "@/lib/core/errors";
import { callerFrom, type Caller } from "@/lib/core/access";
import { env } from "@/lib/env";
import { can, needs, type Action } from "@/lib/permissions";

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
};

/** One place that turns thrown errors into the API's error shape. */
export function handle(err: unknown) {
  if (err instanceof AssetError) return fail(STATUS[err.code], err.code, err.message, err.detail);
  if (err instanceof z.ZodError) return fail(400, "invalid_request", "Invalid request body", z.treeifyError(err));
  if (err instanceof SyntaxError) return fail(400, "invalid_request", "Body is not valid JSON");
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
  // these requests; nothing without cookies (a key, a CLI) needs it.
  if (!SAFE.has(req.method) && !req.headers.has("authorization")) {
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(env.APP_URL).origin) return fail(403, "forbidden", "Cross-origin requests are refused");
  }
  const caller = await callerFrom(req);
  const challenge = { "WWW-Authenticate": 'Bearer realm="artbucket"' };
  if (!caller) return fail(401, "unauthorized", "Unknown API key", undefined, challenge);
  if (need === null || can(caller, need)) return caller;
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
