import { body, ok, route } from "@/lib/api";
import { actorOf } from "@/lib/core/brands";
import { importGoogleFont, searchGoogleFonts } from "@/lib/core/fonts";
import { GoogleFontImport, GoogleFontQuery } from "@/lib/schemas";
import { allows } from "@/lib/scopes";

/** GET /api/v1/fonts/google?q=plex&category=Serif - the Google Fonts catalog, to pick a family from. */
export const GET = route("read", async (req) =>
  ok(await searchGoogleFonts(GoogleFontQuery.parse(Object.fromEntries(new URL(req.url).searchParams)))),
);

/**
 * POST /api/v1/fonts/google - `{ family: "Inter" }` becomes one asset per
 * style. Like a URL ingest, without the write scope they land `proposed`.
 */
export const POST = route("propose", async (req, _params, caller) => {
  const input = await body(req, GoogleFontImport);
  const status = allows(caller.scope, "write") ? "active" : "proposed";
  const { family, assets } = await importGoogleFont({ ...input, status, actor: await actorOf(caller) });
  return ok({ family, data: assets }, { status: 201 });
});
