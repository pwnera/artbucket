import { body, ok, route } from "@/lib/api";
import { getSso, redirectUri, removeSso, saveSso } from "@/lib/core/sso";
import { SsoInput } from "@/lib/schemas";

/** GET /api/v1/sso - the organization's own single sign-on, or null, and the redirect URI to register before setting it up. Never the secret. */
export const GET = route("organization.manage", async (_req, _p, caller) =>
  ok({ data: await getSso(caller), redirectUri: redirectUri(caller.workspace.organizationId) }),
);

/** PUT /api/v1/sso - set up or change it: the issuer's endpoints are discovered now. */
export const PUT = route("organization.manage", async (req, _p, caller) => ok({ data: await saveSso(caller, await body(req, SsoInput)) }));

/** DELETE /api/v1/sso - turn it off; its people keep their accounts. */
export const DELETE = route("organization.manage", async (_req, _p, caller) =>
  (await removeSso(caller)) ? ok({ data: { deleted: true } }) : null,
"No single sign-on here");
