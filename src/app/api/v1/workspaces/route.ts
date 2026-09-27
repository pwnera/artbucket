import { body, ok, route } from "@/lib/api";
import { createWorkspace, listWorkspaces } from "@/lib/core/people";
import { CreateWorkspace } from "@/lib/schemas";

/** GET /api/v1/workspaces - the current organization's workspaces you can open, with your scope in each. */
export const GET = route(null, async (_req, _p, caller) => ok({ data: await listWorkspaces(caller) }));

/** POST /api/v1/workspaces - a new library in the current organization. Organization admin. */
export const POST = route(null, async (req, _p, caller) =>
  ok({ data: await createWorkspace(caller, await body(req, CreateWorkspace)) }, { status: 201 }),
);
