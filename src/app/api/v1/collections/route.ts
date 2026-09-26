import { body, ok, route } from "@/lib/api";
import { createCollection, listCollections } from "@/lib/core/collections";
import { CollectionCreate } from "@/lib/schemas";

/** GET /api/v1/collections - every collection, with its member count. */
export const GET = route("read", async () => ok({ data: await listCollections() }));

/** POST /api/v1/collections */
export const POST = route("write", async (req) =>
  ok({ data: await createCollection(await body(req, CollectionCreate)) }, { status: 201 }),
);
