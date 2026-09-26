import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { setMembers } from "@/lib/core/collections";

type Ctx = { params: Promise<{ id: string }> };

const Change = z.strictObject({
  add: z.array(z.uuid()).max(1000).optional(),
  remove: z.array(z.uuid()).max(1000).optional(),
});

/** POST /api/v1/collections/{id}/assets - `{ add: [...], remove: [...] }` in one call. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return fail(404, "not_found", "No such collection");
    await setMembers(id.data, await body(req, Change));
    return ok({ data: { ok: true } });
  } catch (err) {
    return handle(err);
  }
}
