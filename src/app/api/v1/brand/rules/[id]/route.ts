import { z } from "zod";
import { body, ok, route } from "@/lib/api";
import { deleteRule, updateRule } from "@/lib/core/brand";
import { actorOf } from "@/lib/core/brands";
import { RulePatch } from "@/lib/schemas";

type P = { id: string };
const missing = "No such brand rule";
const valid = (id: string) => z.uuid().safeParse(id).success;

/** PATCH /api/v1/brand/rules/{id} - value, usage, context, assets; a new key renames it and its versions. */
export const PATCH = route<P>("write", async (req, { id }, caller) => {
  const r = valid(id) ? await updateRule(id, await body(req, RulePatch), await actorOf(caller)) : null;
  return r && ok({ data: r });
}, missing);

/** DELETE /api/v1/brand/rules/{id} */
export const DELETE = route<P>("write", async (_req, { id }, caller) =>
  valid(id) && (await deleteRule(id, await actorOf(caller))) ? ok({ data: { deleted: true } }) : null,
missing);
