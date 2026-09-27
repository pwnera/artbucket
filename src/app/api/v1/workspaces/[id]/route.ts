import { body, ok, route } from "@/lib/api";
import { renameWorkspace } from "@/lib/core/people";
import { WorkspacePatch } from "@/lib/schemas";

/** PATCH /api/v1/workspaces/{id} - rename it. Admin there. */
export const PATCH = route<{ id: string }>(null, async (req, { id }, caller) => {
  const ws = await renameWorkspace(caller, id, (await body(req, WorkspacePatch)).name);
  return ws && ok({ data: ws });
}, "No such workspace");
