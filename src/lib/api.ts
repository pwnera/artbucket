import { NextResponse } from "next/server";
import { z } from "zod";
import { AssetError } from "@/lib/core/errors";
import { callerFrom, type Caller } from "@/lib/core/keys";
import { allows, type Scope } from "@/lib/scopes";

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
 * Resolve the caller and check its scope. Returns the caller, or the response
 * to send instead: 401 when a key is missing or unknown, 403 when a real key
 * lacks the scope.
 */
export async function authorize(req: Request, need: Scope): Promise<Caller | Response> {
  const caller = await callerFrom(req);
  const challenge = { "WWW-Authenticate": 'Bearer realm="artbucket"' };
  if (!caller) return fail(401, "unauthorized", "Unknown API key", undefined, challenge);
  if (allows(caller.scope, need)) return caller;
  return caller.key
    ? fail(403, "forbidden", `This key's scope is ${caller.scope}; this needs ${need}`)
    : fail(401, "unauthorized", `Send an API key with the ${need} scope`, undefined, challenge);
}

/**
 * Every /api/v1 handler: check the scope, run, map errors. Handlers return a
 * Response, or `null` for a 404 with the given message.
 */
export function route<P = object>(
  need: Scope,
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
