import { body, ok, route } from "@/lib/api";
import { deleteField, updateField } from "@/lib/core/fields";
import { FieldDefPatch } from "@/lib/schemas";

type P = { key: string };
const missing = "No such field";

/** PATCH /api/v1/fields/{key} - label, options, required, position. */
export const PATCH = route<P>("field.manage", async (req, { key }, caller) => {
  const field = await updateField(caller.workspace.id, key, await body(req, FieldDefPatch));
  return field && ok({ data: field });
}, missing);

/** DELETE /api/v1/fields/{key} - also removes every value stored under it. */
export const DELETE = route<P>("field.manage", async (_req, { key }, caller) =>
  (await deleteField(caller.workspace.id, key)) ? ok({ data: { deleted: true } }) : null,
missing);
