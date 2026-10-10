import { ok, route } from "@/lib/api";
import { describeObject } from "@/lib/core/catalog";

/** GET /api/v1/catalog/{id or address} - one object, described. An address goes URL-encoded, slashes and all. */
export const GET = route<{ ref: string }>("catalog.read", async (_req, { ref }, caller) => {
  const found = await describeObject(caller, decodeURIComponent(ref));
  return found && ok(found);
});
