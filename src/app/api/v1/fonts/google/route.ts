import { body, narrow, ok, route } from "@/lib/api";
import { importGoogleFont, searchGoogleFonts } from "@/lib/core/fonts";
import { GoogleFontImport, GoogleFontQuery } from "@/lib/schemas";

/** GET /api/v1/fonts/google?q=plex&category=Serif - the Google Fonts catalog, to pick a family from. */
export const GET = route(narrow("read"), async (req) =>
  ok(await searchGoogleFonts(GoogleFontQuery.parse(Object.fromEntries(new URL(req.url).searchParams)))),
);

/**
 * POST /api/v1/fonts/google - `{ family: "Inter" }` becomes one asset per
 * style. Like a URL ingest, without the write scope they land `proposed`.
 */
export const POST = route(narrow("propose"), async (req, _params, caller) => {
  const { family, assets } = await importGoogleFont(caller, await body(req, GoogleFontImport));
  return ok({ family, data: assets }, { status: 201 });
});
