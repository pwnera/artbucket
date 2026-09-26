import { body, handle, ok } from "@/lib/api";
import { createField, listFields } from "@/lib/core/fields";
import { FieldDefInput } from "@/lib/fields";

/** GET /api/v1/fields - the library's custom field schema, in display order. */
export async function GET() {
  try {
    return ok({ data: await listFields() });
  } catch (err) {
    return handle(err);
  }
}

/** POST /api/v1/fields - define a field. `key` and `type` can't change later. */
export async function POST(req: Request) {
  try {
    return ok({ data: await createField(await body(req, FieldDefInput)) }, { status: 201 });
  } catch (err) {
    return handle(err);
  }
}
