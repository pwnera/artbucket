import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { deleteCollection, getCollection, updateCollection } from "@/lib/core/collections";

type Ctx = { params: Promise<{ id: string }> };

const Id = z.uuid();
const notFound = () => fail(404, "not_found", "No such collection");

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const id = Id.safeParse((await params).id);
    const c = id.success ? await getCollection(id.data) : null;
    return c ? ok({ data: c }) : notFound();
  } catch (err) {
    return handle(err);
  }
}

const Patch = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
});

/** PATCH /api/v1/collections/{id} - `fields` merges, null clears; members re-inherit. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const id = Id.safeParse((await params).id);
    const c = id.success ? await updateCollection(id.data, await body(req, Patch)) : null;
    return c ? ok({ data: c }) : notFound();
  } catch (err) {
    return handle(err);
  }
}

/** DELETE /api/v1/collections/{id} - the assets stay; they stop inheriting from it. */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const id = Id.safeParse((await params).id);
    return id.success && (await deleteCollection(id.data)) ? ok({ data: { deleted: true } }) : notFound();
  } catch (err) {
    return handle(err);
  }
}
