import { z } from "zod";
import { body, ok, route } from "@/lib/api";
import { deleteGroup, renameGroup } from "@/lib/core/groups";
import { GroupInput } from "@/lib/schemas";

const isId = (id: string) => z.uuid().safeParse(id).success;

/** PATCH /api/v1/groups/{id} - rename it. */
export const PATCH = route<{ id: string }>(null, async (req, { id }, caller) =>
  isId(id) ? ok({ data: await renameGroup(caller, id, (await body(req, GroupInput)).name) }) : null,
"No such group");

/** DELETE /api/v1/groups/{id} - and its grants: its members keep only their own. */
export const DELETE = route<{ id: string }>(null, async (_req, { id }, caller) =>
  isId(id) && (await deleteGroup(caller, id)) ? ok({ data: { deleted: true } }) : null,
"No such group");
