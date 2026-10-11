import { body, ok, route } from "@/lib/api";
import { contextOf } from "@/lib/core/settings";
import { switchFeature } from "@/lib/core/features";
import { FeatureSwitch } from "@/lib/schemas";

type P = { id: string };

/**
 * PUT /api/v1/features/{id}?context=organization - turn it on or off: for
 * every project, or (`projects`) let each decide; in a project, where its
 * organization lets it. A feature of the server's may refuse being turned on,
 * and then nothing changes. Admin there.
 */
export const PUT = route<P>(null, async (req, { id }, caller) => {
  const { state } = await body(req, FeatureSwitch);
  return ok({ data: await switchFeature(caller, contextOf(req), id, state) });
});
