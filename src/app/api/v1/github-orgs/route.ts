import { body, ok, route } from "@/lib/api";
import { addGithub, listGithub } from "@/lib/core/hub-trust";
import { GithubInput } from "@/lib/schemas";

/** GET /api/v1/github-orgs - the GitHub accounts the organization named, proved or not. */
export const GET = route("organization.manage", async (_req, _p, caller) => ok({ data: await listGithub(caller) }));

/**
 * POST /api/v1/github-orgs - name a GitHub account as the organization's. It
 * proves nothing until the file it names is in place and verified.
 */
export const POST = route("organization.manage", async (req, _p, caller) =>
  ok({ data: await addGithub(caller, (await body(req, GithubInput)).login) }, { status: 201 }),
);
