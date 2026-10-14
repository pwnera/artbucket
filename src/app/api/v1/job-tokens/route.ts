import { body, ok, route } from "@/lib/api";
import { createJobToken, revokeJobToken } from "@/lib/core/keys";
import { CreateJobToken } from "@/lib/schemas";

/**
 * POST /api/v1/job-tokens - a token for a feature's background job, done as you (lib/core/keys.ts): from your session,
 * for the feature Artbucket-Feature names. The response carries the token, the only time it is shown.
 */
export const POST = route(null, async (req, _p, caller) => ok({ data: await createJobToken(caller, await body(req, CreateJobToken)) }, { status: 201 }));

/** DELETE /api/v1/job-tokens - the job token sending it, revoked: its job is done. */
export const DELETE = route(null, async (_req, _p, caller) => ((await revokeJobToken(caller)) ? ok({ revoked: true }) : null), "This isn't a job token");
