import { body, ok, route } from "@/lib/api";
import { createOrganization, listOrganizations } from "@/lib/core/people";
import { CreateOrganization } from "@/lib/schemas";

/** GET /api/v1/organizations - the organizations you belong to. */
export const GET = route(null, async (_req, _p, caller) => ok({ data: await listOrganizations(caller) }));

/** POST /api/v1/organizations - a new one, with a first workspace; you are its admin. Needs an account. */
export const POST = route(null, async (req, _p, caller) =>
  ok({ data: await createOrganization(caller, await body(req, CreateOrganization)) }, { status: 201 }),
);
