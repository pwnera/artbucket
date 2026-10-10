import { body, ok, route } from "@/lib/api";
import { createKey, listKeys } from "@/lib/core/keys";
import { CreateKey } from "@/lib/schemas";

/**
 * GET /api/v1/keys - Connected agents, without their secrets: every key in
 * the project for an admin, the agents you connected for anyone else.
 */
export const GET = route("library.read", async (_req, _p, caller) => ok({ data: await listKeys(caller) }));

/** POST /api/v1/keys - a key for this project. The response carries the secret, the only time it is shown. */
export const POST = route("key.manage", async (req, _p, caller) =>
  ok({ data: await createKey(caller, await body(req, CreateKey)) }, { status: 201 }),
);
