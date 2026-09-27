import { body, ok, route } from "@/lib/api";
import { createCollection, listCollections } from "@/lib/core/collections";
import { CollectionCreate } from "@/lib/schemas";

/** GET /api/v1/collections - every collection you can see, with its member count. */
export const GET = route("collection.read", async (_req, _p, caller) => ok({ data: await listCollections(caller) }));

/** POST /api/v1/collections */
export const POST = route("collection.create", async (req, _p, caller) =>
  ok({ data: await createCollection(caller, await body(req, CollectionCreate)) }, { status: 201 }),
);
