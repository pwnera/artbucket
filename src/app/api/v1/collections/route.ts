import { z } from "zod";
import { COLLECTION_ICONS } from "@/lib/collection-icons";
import { body, handle, ok } from "@/lib/api";
import { createCollection, listCollections } from "@/lib/core/collections";

/** GET /api/v1/collections - every collection, with its member count. */
export async function GET() {
  try {
    return ok({ data: await listCollections() });
  } catch (err) {
    return handle(err);
  }
}

const Create = z.strictObject({
  /** One of lib/collection-icons.ts; null resets to the default. */
  icon: z.enum(COLLECTION_ICONS).nullable().optional(),
  name: z.string().trim().min(1).max(120),
  /** Values its members inherit. Validated against the field schema. */
  fields: z.record(z.string(), z.unknown()).optional(),
});

/** POST /api/v1/collections */
export async function POST(req: Request) {
  try {
    return ok({ data: await createCollection(await body(req, Create)) }, { status: 201 });
  } catch (err) {
    return handle(err);
  }
}
