import { z } from "zod";
import { body, handle, ok } from "@/lib/api";
import { finalizeUpload, searchAssets } from "@/lib/core/assets";

const Query = z.object({
  q: z.string().max(512).optional(),
  tag: z.array(z.string().max(64)).max(20),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
});

/**
 * GET /api/v1/assets?q=fox&tag=brand&tag=logo
 *
 * Browse and search in one: `q` is prefix full-text over filename, tags and
 * embedded metadata; each `tag` narrows to assets carrying it. The response
 * carries tag facet counts for the same filter.
 */
export async function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams;
    const { tag, ...rest } = Query.parse({
      q: p.get("q") ?? undefined,
      tag: p.getAll("tag"),
      limit: p.get("limit") ?? undefined,
      offset: p.get("offset") ?? undefined,
    });
    return ok(await searchAssets({ ...rest, tags: tag }));
  } catch (err) {
    return handle(err);
  }
}

const Finalize = z.object({
  token: z.uuid(),
  filename: z.string().min(1).max(512),
  mime: z.string().min(1).max(255),
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
