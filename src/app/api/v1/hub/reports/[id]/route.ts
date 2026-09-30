import { body, ok, route } from "@/lib/api";
import { decideReport } from "@/lib/core/hub-trust";
import { HubReportPatch } from "@/lib/schemas";

/** PATCH /api/v1/hub/reports/{id} - mark it dealt with, or open again; `delist` takes its listing off BrandHub. */
export const PATCH = route<{ id: string }>("organization.manage", async (req, { id }, caller) => {
  const r = /^[0-9a-f-]{36}$/i.test(id) ? await decideReport(caller, id, await body(req, HubReportPatch)) : null;
  return r ? ok({ data: r }) : null;
}, "No such report");
