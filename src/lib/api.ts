import { NextResponse } from "next/server";
import { z } from "zod";
import { AssetError } from "@/lib/core/assets";

export const ok = <T>(data: T, init?: ResponseInit) => NextResponse.json(data, init);

export const fail = (status: number, code: string, message: string, extra?: unknown) =>
  NextResponse.json({ error: { code, message, ...(extra ? { detail: extra } : {}) } }, { status });

const STATUS: Record<AssetError["code"], number> = {
  not_found: 404,
  too_large: 413,
  unsupported: 415,
};

/** One place that turns thrown errors into the API's error shape. */
export function handle(err: unknown) {
  if (err instanceof AssetError) return fail(STATUS[err.code], err.code, err.message);
  if (err instanceof z.ZodError) return fail(400, "invalid_request", "Invalid request body", z.treeifyError(err));
  console.error(err);
  return fail(500, "internal_error", "Something went wrong");
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  return schema.parse(await req.json());
}
