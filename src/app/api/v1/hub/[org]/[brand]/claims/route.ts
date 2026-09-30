import { body, ok, route } from "@/lib/api";
import { claimListing } from "@/lib/core/hub-trust";
import { HubClaimInput } from "@/lib/schemas";

/**
 * POST /api/v1/hub/{org}/{brand}/claims - claim a public listing as your
 * brand: an organization admin, signed in, whose organization proved a domain
 * or a GitHub account. Its owner and this server's operator see the claim.
 */
export const POST = route<{ org: string; brand: string }>("organization.manage", async (req, { org, brand }, caller) =>
  ok({ data: await claimListing(caller, org, brand, await body(req, HubClaimInput)) }, { status: 202 }),
);
