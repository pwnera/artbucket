import { z } from "zod";
import { body, ok, route } from "@/lib/api";
import { setGroupMembers } from "@/lib/core/groups";
import { GroupMembersChange } from "@/lib/schemas";

/** POST /api/v1/groups/{id}/members - add and remove members: people of the organization only. */
export const POST = route<{ id: string }>(null, async (req, { id }, caller) =>
  z.uuid().safeParse(id).success ? ok({ data: await setGroupMembers(caller, id, await body(req, GroupMembersChange)) }) : null,
"No such group");
