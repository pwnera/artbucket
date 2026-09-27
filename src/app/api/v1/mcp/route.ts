import { authorize, fail, handle, narrow } from "@/lib/api";
import { env } from "@/lib/env";
import { handleMcp } from "@/lib/mcp";

/**
 * POST /api/v1/mcp - Model Context Protocol, Streamable HTTP, stateless.
 *
 *   claude mcp add --transport http artbucket http://localhost:3000/api/v1/mcp \
 *     --header "Authorization: Bearer ab_..."
 *
 * Connecting needs the read scope; each tool checks its own (lib/mcp.ts).
 */
export async function POST(req: Request) {
  try {
    // A web page must not be able to drive a local server through the
    // user's browser (DNS rebinding): browsers always send Origin, CLIs don't.
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(env.APP_URL).origin) return fail(403, "forbidden", "Cross-origin MCP requests are refused");
    const caller = await authorize(req, narrow("read"));
    if (caller instanceof Response) return caller;
    let message: unknown;
    try {
      message = await req.json();
    } catch {
      return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
    }
    const res = await handleMcp(message, caller);
    return res ? Response.json(res) : new Response(null, { status: 202 });
  } catch (err) {
    return handle(err);
  }
}

/** No server-initiated stream: this server only ever answers. */
export const GET = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
