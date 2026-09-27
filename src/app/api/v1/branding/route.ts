import { handle, ok } from "@/lib/api";
import { brandFor } from "@/lib/core/branding";

/**
 * GET /api/v1/branding - what the product is called and how it looks for
 * this request: the organization whose domain this is, or whoever is signed
 * in, or the server's. Public: the sign-in screen needs it.
 */
export async function GET(req: Request) {
  try {
    return ok({ data: await brandFor(req) }, { headers: { "Cache-Control": "private, no-cache" } });
  } catch (err) {
    return handle(err);
  }
}
