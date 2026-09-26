import { fail, handle, ok } from "@/lib/api";
import { deleteAsset, getAsset } from "@/lib/core/assets";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const asset = await getAsset((await params).id);
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
