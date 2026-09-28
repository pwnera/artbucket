import { body, ok, route } from "@/lib/api";
import { makeSignedUrl } from "@/lib/core/signing";
import { SignedUrlInput } from "@/lib/schemas";

/** POST /api/v1/assets/{id}/signed-url - a URL anyone can open until it expires. Takes share on it. */
export const POST = route<{ id: string }>("asset.share", async (req, { id }, caller) => {
  const url = await makeSignedUrl(caller, id, (await body(req, SignedUrlInput)).expiresIn);
  return url && ok({ data: url });
}, "No such asset");
