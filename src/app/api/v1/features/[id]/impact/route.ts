import { fail, ok, route } from "@/lib/api";
import { contextOf } from "@/lib/core/settings";
import { featureImpact } from "@/lib/core/features";

type P = { id: string };

/**
 * GET /api/v1/features/{id}/impact?context=organization&state=off - what
 * switching would do, without doing it: the projects it changes and, for what
 * reaches outside (keys in use, links, portals, public listings), what will
 * happen, counted. The app asks for confirmation when `confirm` says so.
 */
export const GET = route<P>(null, async (req, { id }, caller) => {
  const state = new URL(req.url).searchParams.get("state");
  if (state !== "on" && state !== "off" && state !== "projects") return fail(400, "invalid_request", "state is on, off or projects");
  return ok({ data: await featureImpact(caller, contextOf(req), id, state) });
});
