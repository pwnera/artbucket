import { body, ok, route } from "@/lib/api";
import { deleteProject, renameProject } from "@/lib/core/people";
import { ProjectPatch } from "@/lib/schemas";

/** PATCH /api/v1/projects/{id} - rename it. Admin there. */
export const PATCH = route<{ id: string }>(null, async (req, { id }, caller) => {
  const ws = await renameProject(caller, id, (await body(req, ProjectPatch)).name);
  return ws && ok({ data: ws });
}, "No such project");

/** DELETE /api/v1/projects/{id} - with everything in it. Organization admin; not the last one. */
export const DELETE = route<{ id: string }>(null, async (_req, { id }, caller) =>
  (await deleteProject(caller, id)) ? ok({ data: { deleted: true } }) : null,
"No such project");
