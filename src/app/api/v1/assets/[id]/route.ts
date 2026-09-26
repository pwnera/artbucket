import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { deleteAsset, getAsset, updateAsset } from "@/lib/core/assets";
import { MAX_TAG_LENGTH, MAX_TAGS } from "@/lib/search";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const asset = await getAsset((await params).id);
    return asset ? ok({ data: asset }) : fail(404, "not_found", "No such asset");
  } catch (err) {
    return handle(err);
  }
}

const Patch = z.object({
  tags: z.array(z.string().max(MAX_TAG_LENGTH)).max(MAX_TAGS).optional(),
});

/** PATCH /api/v1/assets/{id} - `tags` replaces the whole set. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const asset = await updateAsset((await params).id, await body(req, Patch));
    return asset ? ok({ data: asset }) : fail(404, "not_found", "No such asset");
  } catch (err) {
    return handle(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const gone = await deleteAsset((await params).id);
    return gone ? ok({ data: { deleted: true } }) : fail(404, "not_found", "No such asset");
  } catch (err) {
    return handle(err);
  }
}
