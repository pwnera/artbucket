import { oauth } from "@/lib/api";
import { registerClient } from "@/lib/core/oauth";

/** POST /api/v1/oauth/register - RFC 7591 dynamic client registration. Public clients only: PKCE, no secret. */
export const POST = oauth(async (req) => registerClient(await req.json().catch(() => null)), 201);
