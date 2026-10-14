import { ok, route } from "@/lib/api";
import { recordUses } from "@/lib/core/sites";

/**
 * POST /api/v1/sites/{id}/uses?commit=&ref= - an external site's files as a
 * zip, scanned and not stored: what it uses of the library, and the components
 * its artbucket.site.json names (artbucket site scan adds them), kept as its record.
 */
export const POST = route<{ id: string }>("portal.manage", async (req, { id }, caller) => {
  const q = new URL(req.url).searchParams;
  const data = await recordUses(caller, id, new Uint8Array(await req.arrayBuffer()), { commit: q.get("commit"), ref: q.get("ref") });
  return data && ok({ data });
});
