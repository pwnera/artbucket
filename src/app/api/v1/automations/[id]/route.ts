import { z } from "zod";
import { body, ok, route } from "@/lib/api";
import { deleteAutomation, updateAutomation } from "@/lib/core/automations";
import { AutomationPatch } from "@/lib/schemas";

const isId = (id: string) => z.uuid().safeParse(id).success;

/** PATCH /api/v1/automations/{id} - change it: what is left out stays. */
export const PATCH = route<{ id: string }>("automation.manage", async (req, { id }, caller) =>
  isId(id) ? ok({ data: await updateAutomation(caller, id, await body(req, AutomationPatch)) }) : null,
"No such automation");

/** DELETE /api/v1/automations/{id} - and its run log. */
export const DELETE = route<{ id: string }>("automation.manage", async (_req, { id }, caller) =>
  isId(id) && (await deleteAutomation(caller, id)) ? ok({ data: { deleted: true } }) : null,
"No such automation");
