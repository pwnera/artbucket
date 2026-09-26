import { z } from "zod";
import { body, handle, ok } from "@/lib/api";
import { finalizeUpload, parseAssetQuery, searchAssets } from "@/lib/core/assets";

/**
 * GET /api/v1/assets?q=fox&tag=brand&collection={id}&f.channel=web&f.budget.gte=10
 *
 * Browse and search in one: `q` is prefix full-text over filename, tags,
 * embedded metadata and field values; each `tag` narrows to assets carrying
 * it; `f.*` filters custom fields (see lib/filters.ts). The response carries
 * facet counts for tags and for select and boolean fields.
 */
export async function GET(req: Request) {
  try {
    return ok(await searchAssets(await parseAssetQuery(new URL(req.url).searchParams)));
  } catch (err) {
    return handle(err);
  }
}

const Finalize = z.object({
  token: z.uuid(),
  filename: z.string().min(1).max(512),
  mime: z.string().min(1).max(255),
  /** Custom field values; validated against the schema, required ones enforced. */
  fields: z.record(z.string(), z.unknown()).optional(),
  /** Collections to file it into; their values count toward required fields. */
  collections: z.array(z.uuid()).max(50).optional(),
});

/** POST /api/v1/assets - promote a staged upload. Idempotent by content hash. */
export async function POST(req: Request) {
  try {
    const { asset, deduped } = await finalizeUpload(await body(req, Finalize));
    return ok({ data: asset, deduped }, { status: deduped ? 200 : 201 });
  } catch (err) {
    return handle(err);
  }
}
