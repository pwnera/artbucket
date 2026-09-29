import { body, ok, route } from "@/lib/api";
import { importIcons, searchIconSets } from "@/lib/core/icons";
import { IconImport, IconSetQuery } from "@/lib/schemas";

/** GET /api/v1/icons?q=tabler&group=Logos - Iconify's open source icon sets, to pick one from. */
export const GET = route("library.read", async (req) =>
  ok(await searchIconSets(IconSetQuery.parse(Object.fromEntries(new URL(req.url).searchParams)))),
);

/**
 * POST /api/v1/icons - `{ prefix: "tabler", icons: ["home", "search"] }`
 * becomes one SVG asset per icon. Like a URL ingest, without the write scope
 * they land `proposed`.
 */
export const POST = route("asset.upload", async (req, _params, caller) => {
  const { set, assets, missing } = await importIcons(caller, await body(req, IconImport));
  return ok({ set, data: assets, missing }, { status: 201 });
});
