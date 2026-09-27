import { form, oauth } from "@/lib/api";
import { exchange } from "@/lib/core/oauth";

/** POST /api/v1/oauth/token - a code (with its PKCE verifier) or an approved device code, for a key. */
export const POST = oauth(async (req) => exchange(await form(req)));
