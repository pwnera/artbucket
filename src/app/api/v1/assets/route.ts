import { z } from "zod";
import { body, handle, ok } from "@/lib/api";
import { finalizeUpload, listAssets } from "@/lib/core/assets";

/** GET /api/v1/assets */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return ok({ data: await listAssets(limit, offset) });
  } catch (err) {
    return handle(err);
  }
}

const Finalize = z.object({
  token: z.uuid(),
  filename: z.string().min(1).max(512),
  mime: z.string().min(1).max(255),
});

/** POST /api/v1/assets — promote a staged upload. Idempotent by content hash. */
export async function POST(req: Request) {
  try {
    const { asset, deduped } = await finalizeUpload(await body(req, Finalize));
    return ok({ data: asset, deduped }, { status: deduped ? 200 : 201 });
  } catch (err) {
    return handle(err);
  }
}
