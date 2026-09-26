import { z } from "zod";
import { body, ok, route } from "@/lib/api";
import { deleteCollection, getCollection, updateCollection } from "@/lib/core/collections";
import { CollectionPatch } from "@/lib/schemas";

type P = { id: string };
const missing = "No such collection";
/** A malformed id is simply a collection that doesn't exist. */
const valid = (id: string) => z.uuid().safeParse(id).success;

export const GET = route<P>("read", async (_req, { id }) => {
  const c = valid(id) ? await getCollection(id) : null;
  return c && ok({ data: c });
}, missing);

/** PATCH /api/v1/collections/{id} - `fields` merges, null clears; members re-inherit. */
export const PATCH = route<P>("write", async (req, { id }) => {
  const c = valid(id) ? await updateCollection(id, await body(req, CollectionPatch)) : null;
  return c && ok({ data: c });
}, missing);

/** DELETE /api/v1/collections/{id} - the assets stay; they stop inheriting from it. */
export const DELETE = route<P>("write", async (_req, { id }) =>
  valid(id) && (await deleteCollection(id)) ? ok({ data: { deleted: true } }) : null,
missing);
