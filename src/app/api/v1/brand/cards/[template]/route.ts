import { route } from "@/lib/api";
import { getAsset } from "@/lib/core/assets";
import { brandCard } from "@/lib/core/cards";
import { AssetError } from "@/lib/core/errors";
import { CardQuery, isCardTemplate, queryIssues } from "@/lib/cards";
import { ReleaseRef } from "@/lib/schemas";

/**
 * GET /api/v1/brand/cards/og?brand=acme&title=... - the brand's share card
 * (lib/core/cards.ts), a 1200x630 PNG in its latest release's colors,
 * faces and logo, for whoever may read the brand: a private brand's, or a
 * build that saves it. `version` draws a release by its number. A public
 * brand's card is on BrandHub too, keyless: {org}/{brand}/og.png.
 */
export const GET = route("brand.read", async (req, { template }: { template: string }, caller) => {
  if (!isCardTemplate(template)) return null;
  const { brand, version, ...rest } = Object.fromEntries(new URL(req.url).searchParams);
  const q = CardQuery.safeParse(rest);
  if (!q.success) throw new AssetError("invalid", queryIssues(q.error));
  const v = version === undefined ? "live" : ReleaseRef.safeParse(version).data;
  if (v === undefined) throw new AssetError("invalid", 'version is "live" or a release number');
  const c = await brandCard(caller.project.id, brand, v === "live" ? undefined : v, template, q.data, async (a) => !!(await getAsset(caller, a.id)));
  const headers = { "Cache-Control": "private, no-cache", ETag: c.etag };
  if (req.headers.get("if-none-match") === c.etag) return new Response(null, { status: 304, headers });
  const png = await c.draw();
  return new Response(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png", "Content-Length": String(png.length) } });
}, "No such card: there is og");
