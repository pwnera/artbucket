import { z } from "zod";
import { fail, handle, ok } from "@/lib/api";
import { deleteSearch } from "@/lib/core/searches";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/v1/searches/{id} */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const id = z.uuid().safeParse((await params).id);
    return id.success && (await deleteSearch(id.data))
      ? ok({ data: { deleted: true } })
      : fail(404, "not_found", "No such saved search");
  } catch (err) {
    return handle(err);
  }
}
