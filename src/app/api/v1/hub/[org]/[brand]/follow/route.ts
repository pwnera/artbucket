import { ok, route } from "@/lib/api";
import { star } from "@/lib/core/hub";

type P = { org: string; brand: string };

/**
 * Deprecated: following a brand is starring it now (../star). Kept, as
 * docs/developers/stability.mdx says, answering as it always did.
 */
const deprecated = (req: Request) => ({
  Deprecation: "true",
  Link: `<${new URL(req.url).pathname.replace(/\/follow$/, "/star")}>; rel="successor-version"`,
});

/** PUT /api/v1/hub/{org}/{brand}/follow - deprecated: PUT .../star. */
export const PUT = route<P>(null, async (req, { org, brand }, caller) => {
  await star(caller, org, brand, true);
  return ok({ data: { following: true } }, { headers: deprecated(req) });
});

/** DELETE /api/v1/hub/{org}/{brand}/follow - deprecated: DELETE .../star. */
export const DELETE = route<P>(null, async (req, { org, brand }, caller) => {
  await star(caller, org, brand, false);
  return ok({ data: { following: false } }, { headers: deprecated(req) });
});
