import { body, ok, route } from "@/lib/api";
import { createKey, listKeys } from "@/lib/core/keys";
import { CreateKey } from "@/lib/schemas";

/** GET /api/v1/keys - every key, without its secret. */
export const GET = route("admin", async () => ok({ data: await listKeys() }));

/** POST /api/v1/keys - the response carries the secret, the only time it is shown. */
export const POST = route("admin", async (req) =>
  ok({ data: await createKey(await body(req, CreateKey)) }, { status: 201 }),
);
