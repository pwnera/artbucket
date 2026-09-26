import { body, ok, route } from "@/lib/api";
import { createField, listFields } from "@/lib/core/fields";
import { FieldDefInput } from "@/lib/schemas";

/** GET /api/v1/fields - the library's custom field schema, in display order. */
export const GET = route("read", async () => ok({ data: await listFields() }));

/** POST /api/v1/fields - define a field. `key` and `type` can't change later. */
export const POST = route("write", async (req) =>
  ok({ data: await createField(await body(req, FieldDefInput)) }, { status: 201 }),
);
