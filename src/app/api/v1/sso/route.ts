import { body, ok, route } from "@/lib/api";
import { getSso, redirectUri, redirectUris, removeSso, saveSso, setSsoRequired } from "@/lib/core/sso";
import { SsoInput, SsoRequiredInput } from "@/lib/schemas";

/** GET /api/v1/sso - the organization's own single sign-on, or null, and the redirect URIs to register before setting it up. Never the secret. */
export const GET = route("organization.manage", async (_req, _p, caller) => {
  const org = caller.workspace.organizationId;
  return ok({ data: await getSso(caller), redirectUri: redirectUri(org), redirectUris: await redirectUris(org) });
});

/** PUT /api/v1/sso - set up or change it: the issuer's endpoints are discovered now. */
export const PUT = route("organization.manage", async (req, _p, caller) => ok({ data: await saveSso(caller, await body(req, SsoInput)) }));

/** PATCH /api/v1/sso - require it, or not: required, nobody at the domain but the organization's admins signs in with a password. */
export const PATCH = route("organization.manage", async (req, _p, caller) => {
  const s = await setSsoRequired(caller, (await body(req, SsoRequiredInput)).required);
  return s ? ok({ data: s }) : null;
}, "No single sign-on here");

/** DELETE /api/v1/sso - turn it off; its people keep their accounts. */
export const DELETE = route("organization.manage", async (_req, _p, caller) =>
  (await removeSso(caller)) ? ok({ data: { deleted: true } }) : null,
"No single sign-on here");
