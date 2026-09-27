import { z } from "zod";
import { body, narrow, ok, route } from "@/lib/api";
import { deleteCollection, getCollection, updateCollection } from "@/lib/core/collections";
import { CollectionPatch } from "@/lib/schemas";

type P = { id: string };
const missing = "No such collection";
/** A malformed id is simply a collection that doesn't exist. */
const valid = (id: string) => z.uuid().safeParse(id).success;

export const GET = route<P>(narrow("read"), async (_req, { id }, caller) => {
  const c = valid(id) ? await getCollection(caller, id) : null;
  return c && ok({ data: c });
}, missing);

/** PATCH /api/v1/collections/{id} - `fields` merges, null clears; members re-inherit. */
export const PATCH = route<P>(narrow("write"), async (req, { id }, caller) => {
  const c = valid(id) ? await updateCollection(caller, id, await body(req, CollectionPatch)) : null;
  return c && ok({ data: c });
}, missing);

/** DELETE /api/v1/collections/{id} - the assets stay; they stop inheriting from it. */
export const DELETE = route<P>("write", async (_req, { id }, caller) =>
  valid(id) && (await deleteCollection(caller.workspace.id, id)) ? ok({ data: { deleted: true } }) : null,
missing);
