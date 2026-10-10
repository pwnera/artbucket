import { ok, route } from "@/lib/api";
import { whoCan } from "@/lib/core/catalog";

/** GET /api/v1/catalog/{id or address}/access?who= - who reaches it, and the grant behind each role. */
export const GET = route<{ ref: string }>("catalog.read", async (req, { ref }, caller) => {
  const found = await whoCan(caller, decodeURIComponent(ref), new URL(req.url).searchParams.get("who") ?? undefined);
  return found && ok(found);
});
