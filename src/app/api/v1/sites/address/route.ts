import { ok, route } from "@/lib/api";
import { portalAddress } from "@/lib/core/portals";

/**
 * GET /api/v1/sites/address?slug={slug}&portal={id} - whether a portal may
 * take this address (`portal`: the one being renamed; `subdomain=0`: it won't
 * answer at {slug}.PORTAL_DOMAIN), why not, and its URL.
 */
export const GET = route("portal.manage", async (req, _p, caller) => {
  const q = new URL(req.url).searchParams;
  return ok({ data: await portalAddress(caller, q.get("slug") ?? "", q.get("portal") ?? undefined, q.get("subdomain") !== "0") });
});
