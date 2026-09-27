import { body, narrow, ok, route } from "@/lib/api";
import { createField, listFields } from "@/lib/core/fields";
import { FieldDefInput } from "@/lib/schemas";

/** GET /api/v1/fields - the workspace's custom field schema, in display order. */
export const GET = route(narrow("read"), async (_req, _p, caller) => ok({ data: await listFields(caller.workspace.id) }));

/** POST /api/v1/fields - define a field. `key` and `type` can't change later. */
export const POST = route("write", async (req, _p, caller) =>
  ok({ data: await createField(caller.workspace.id, await body(req, FieldDefInput)) }, { status: 201 }),
);
