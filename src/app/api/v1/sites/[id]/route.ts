import { z } from "zod";
import { body, ok, route } from "@/lib/api";
import { deletePortal, getPortal, updatePortal } from "@/lib/core/portals";
import { PortalPatch } from "@/lib/schemas";

type P = { id: string };
const valid = (id: string) => z.uuid().safeParse(id).success;

/** GET /api/v1/sites/{id} */
export const GET = route<P>("portal.manage", async (_req, { id }, caller) => {
  const p = valid(id) && (await getPortal(caller, id));
  return p ? ok({ data: p }) : null;
}, "No such portal");

/** PATCH /api/v1/sites/{id} - change what it shows, how it looks, or who gets in. */
export const PATCH = route<P>("portal.manage", async (req, { id }, caller) => {
  const input = await body(req, PortalPatch);
  const p = valid(id) && (await updatePortal(caller, id, input));
  return p ? ok({ data: p }) : null;
}, "No such portal");

/** DELETE /api/v1/sites/{id} - its address and domain stop answering at once. */
export const DELETE = route<P>("portal.manage", async (_req, { id }, caller) =>
  valid(id) && (await deletePortal(caller, id)) ? ok({ data: { deleted: true } }) : null,
"No such portal");
