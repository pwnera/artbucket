import { body, ok, route } from "@/lib/api";
import { createProject, listProjects } from "@/lib/core/people";
import { CreateProject } from "@/lib/schemas";

/** GET /api/v1/projects - the current organization's projects you can open, with your scope in each. */
export const GET = route(null, async (_req, _p, caller) => ok({ data: await listProjects(caller) }));

/** POST /api/v1/projects - a new library in the current organization. Organization admin. */
export const POST = route(null, async (req, _p, caller) =>
  ok({ data: await createProject(caller, await body(req, CreateProject)) }, { status: 201 }),
);
