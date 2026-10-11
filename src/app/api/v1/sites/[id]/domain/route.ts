import { z } from "zod";
import { ok, route } from "@/lib/api";
import { verifyDomain } from "@/lib/core/portals";

/**
 * POST /api/v1/sites/{id}/domain - look for the domain's TXT record now.
 * Found, the portal is served at the domain. A 422 says what was found instead.
 */
export const POST = route<{ id: string }>("portal.manage", async (_req, { id }, caller) => {
  const p = z.uuid().safeParse(id).success && (await verifyDomain(caller, id));
  return p ? ok({ data: p }) : null;
}, "No such portal");
