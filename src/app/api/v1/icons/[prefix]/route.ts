import { ok, route } from "@/lib/api";
import { browseIconSet } from "@/lib/core/icons";
import { IconBrowseQuery } from "@/lib/schemas";

/** GET /api/v1/icons/tabler?q=arrow - a set's icons, each as the SVG an import stores. */
export const GET = route<{ prefix: string }>("library.read", async (req, params) => {
  const { prefix, ...query } = IconBrowseQuery.parse({ ...Object.fromEntries(new URL(req.url).searchParams), prefix: params.prefix });
  return ok(await browseIconSet(prefix, query));
});
