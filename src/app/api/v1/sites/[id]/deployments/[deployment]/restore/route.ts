import { z } from "zod";
import { ok, route } from "@/lib/api";
import { restoreDeployment } from "@/lib/core/sites";

/** POST /api/v1/sites/{id}/deployments/{deployment}/restore - a replaced deployment live again at its path, the one live there replaced. */
export const POST = route<{ id: string; deployment: string }>("portal.manage", async (_req, { id, deployment }, caller) => {
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(deployment).success) return null;
  const data = await restoreDeployment(caller, id, deployment);
  return data ? ok({ data }) : null;
}, "No such deployment");
