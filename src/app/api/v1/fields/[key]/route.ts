import { body, fail, handle, ok } from "@/lib/api";
import { deleteField, updateField } from "@/lib/core/fields";
import { FieldDefPatch } from "@/lib/fields";

type Ctx = { params: Promise<{ key: string }> };

/** PATCH /api/v1/fields/{key} - label, options, required, position. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const field = await updateField((await params).key, await body(req, FieldDefPatch));
    return field ? ok({ data: field }) : fail(404, "not_found", "No such field");
  } catch (err) {
    return handle(err);
  }
}

/** DELETE /api/v1/fields/{key} - also removes every value stored under it. */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    return (await deleteField((await params).key))
      ? ok({ data: { deleted: true } })
      : fail(404, "not_found", "No such field");
  } catch (err) {
    return handle(err);
  }
}
