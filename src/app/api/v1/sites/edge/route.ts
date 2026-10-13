import { timingSafeEqual } from "node:crypto";
import { edgeRoute } from "@/lib/core/sites";
import { env } from "@/lib/env";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * GET /api/v1/sites/edge?host= - for an edge in front of the server (EDGE_SECRET,
 * in X-Edge-Secret), how to serve a host's builds from storage itself: the
 * site, the preview the host names, its mounts (path, storage prefix, rules)
 * and how long the answer holds; `data: null` when the edge should pass the
 * request on (lib/core/sites.ts edgeRoute). Not in the public API: 404
 * without the secret, and on a server without one.
 */
export async function GET(req: Request) {
  const given = req.headers.get("x-edge-secret") ?? "";
  if (!env.EDGE_SECRET || !same(given, env.EDGE_SECRET)) return Response.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
  const host = new URL(req.url).searchParams.get("host") ?? "";
  const data = host ? await edgeRoute(host) : null;
  return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
}
