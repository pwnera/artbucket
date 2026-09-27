import { body, ok, route } from "@/lib/api";
import { finalizeUpload, ingestFromUrl, parseAssetQuery, searchAssets } from "@/lib/core/assets";
import { actorOf } from "@/lib/core/brands";
import { Finalize } from "@/lib/schemas";
import { allows } from "@/lib/scopes";

/**
 * GET /api/v1/assets?q=fox&tag=brand&collection={id}&f.channel=web&f.budget.gte=10
 *
 * Browse and search in one: `q` is prefix full-text over filename, tags,
 * embedded metadata and field values; each `tag` narrows to assets carrying
 * it; `f.*` filters custom fields (see lib/filters.ts); `review=true` lists
 * what waits on a human. The response carries facet counts for tags and for
 * select and boolean fields.
 */
export const GET = route("read", async (req) =>
  ok(await searchAssets(await parseAssetQuery(new URL(req.url).searchParams))),
);

/**
 * POST /api/v1/assets - promote a staged upload (`token`) or fetch one
 * (`url`). Idempotent by content hash. Without the write scope, the new asset
 * lands `proposed` and waits for a human.
 */
export const POST = route("propose", async (req, _params, caller) => {
  const input = await body(req, Finalize);
  const status = allows(caller.scope, "write") ? "active" : "proposed";
  const actor = await actorOf(caller);
  const { asset, deduped } =
    "url" in input
      ? await ingestFromUrl({ ...input, status, actor })
      : await finalizeUpload({ ...input, status, actor });
  return ok({ data: asset, deduped }, { status: deduped ? 200 : 201 });
});
