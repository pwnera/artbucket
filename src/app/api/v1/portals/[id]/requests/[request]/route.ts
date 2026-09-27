import { z } from "zod";
import { body, ok, route } from "@/lib/api";
import { decideRequest, deleteRequest } from "@/lib/core/portals";
import { PortalDecision } from "@/lib/schemas";

type P = { id: string; request: string };
const valid = ({ id, request }: P) => z.uuid().safeParse(id).success && z.uuid().safeParse(request).success;

/**
 * PATCH /api/v1/portals/{id}/requests/{request} - approve or deny. Approved,
 * they get a link of their own, emailed when the organization's email works.
 */
export const PATCH = route<P>("portal.manage", async (req, params, caller) => {
  const { status } = await body(req, PortalDecision);
  const out = valid(params) && (await decideRequest(caller, params.id, params.request, status));
  return out ? ok(out) : null;
}, "No such request");

/** DELETE /api/v1/portals/{id}/requests/{request} - forget it; an approved link stops working. */
export const DELETE = route<P>("portal.manage", async (_req, params, caller) =>
  valid(params) && (await deleteRequest(caller, params.id, params.request)) ? ok({ data: { deleted: true } }) : null,
"No such request");
