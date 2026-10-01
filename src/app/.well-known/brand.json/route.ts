import { wellKnownBrandJson } from "@/lib/core/hub";
import { hostname } from "@/lib/portal";

const BASE = { "Cache-Control": "public, max-age=300, s-maxage=3600", "Access-Control-Allow-Origin": "*" };

/**
 * GET /.well-known/brand.json on an organization's verified domain: where
 * AdCP's agents look for the domain's brand, pointing at it on BrandHub
 * (lib/core/hub.ts wellKnownBrandJson). Public, keyless; 404 on any other host.
 */
export async function GET(req: Request) {
  const host = hostname(req.headers.get("host") ?? "");
  const doc = host && (await wellKnownBrandJson(host));
  if (!doc) return Response.json({ error: { code: "not_found", message: "No brand is listed for this domain" } }, { status: 404, headers: BASE });
  return Response.json(doc, { headers: BASE });
}
