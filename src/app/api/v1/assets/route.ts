import { body, narrow, ok, route } from "@/lib/api";
import { finalizeUpload, ingestFromUrl, parseAssetQuery, searchAssets } from "@/lib/core/assets";
import { Finalize } from "@/lib/schemas";

/**
 * GET /api/v1/assets?q=fox&tag=brand&collection={id}&f.channel=web&f.budget.gte=10
 *
 * Browse and search in one: `q` is prefix full-text over filename, tags,
 * embedded metadata and field values; each `tag` narrows to assets carrying
 * it; `f.*` filters custom fields (see lib/filters.ts); `review=true` lists
 * what waits on a human. The response carries facet counts for tags and for
 * select and boolean fields. Someone with grants on a few collections sees
 * those collections' assets.
 */
export const GET = route(narrow("read"), async (req, _p, caller) =>
  ok(await searchAssets(caller, await parseAssetQuery(caller, new URL(req.url).searchParams))),
);

/**
 * POST /api/v1/assets - promote a staged upload (`token`) or fetch one
 * (`url`). Idempotent by content hash. Without write where it lands, the new
 * asset is `proposed` and waits for a human.
 */
export const POST = route(narrow("propose"), async (req, _params, caller) => {
  const input = await body(req, Finalize);
  const { asset, deduped } = "url" in input ? await ingestFromUrl(caller, input) : await finalizeUpload(caller, input);
  return ok({ data: asset, deduped }, { status: deduped ? 200 : 201 });
});
