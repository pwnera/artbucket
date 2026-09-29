import { ok, route } from "@/lib/api";
import { iconSetSamples } from "@/lib/core/icons";
import { IconBrowseQuery } from "@/lib/schemas";

/** GET /api/v1/icons/tabler/samples - the few icons a set is shown by, as SVG, so the picker never sends a browser to Iconify. */
export const GET = route<{ prefix: string }>("library.read", async (_req, params) => {
  const { prefix } = IconBrowseQuery.parse({ prefix: params.prefix });
  return ok(await iconSetSamples(prefix), { headers: { "Cache-Control": "private, max-age=86400" } });
});
