import { body, ok, route } from "@/lib/api";
import { createField, listFields } from "@/lib/core/fields";
import { FieldDefInput } from "@/lib/schemas";

/** GET /api/v1/fields - the project's custom field schema, in display order. */
export const GET = route("field.read", async (_req, _p, caller) => ok({ data: await listFields(caller.project.id) }));

/** POST /api/v1/fields - define a field. `key` and `type` can't change later. */
export const POST = route("field.manage", async (req, _p, caller) =>
  ok({ data: await createField(caller.project.id, await body(req, FieldDefInput)) }, { status: 201 }),
);
