import { ok, route } from "@/lib/api";
import { AssetError } from "@/lib/core/errors";
import { draftSource, viewPage } from "@/lib/core/page-view";
import { can, needs } from "@/lib/permissions";
import { DEFAULT_PRESETS } from "@/lib/portal";

type P = { slug: string };

/**
 * GET /api/v1/brands/{slug}/view?page=logo&context=dark-background - a page
 * of the draft as readers with every door open see it, ready to render: the
 * nav, its sections, the rules and assets they show, its collections filled.
 * No page: the first. An old slug gives the page with `redirect` set.
 * `edit=1` (write): hidden pages and sections too, and the warnings.
 */
export const GET = route<P>("brand.read", async (req, { slug }, caller) => {
  const q = new URL(req.url).searchParams;
  const edit = q.get("edit") === "1";
  if (edit && !can(caller, "brand.edit")) throw new AssetError("forbidden", `Editing takes ${needs("brand.edit")}`);
  const ws = caller.workspace.id;
  const view = await viewPage(ws, await draftSource(ws, slug), q.get("page") || null, {
    context: q.get("context") || undefined,
    lang: q.get("lang") || undefined,
    level: edit ? "editor" : "members",
    sign: null,
    presets: DEFAULT_PRESETS,
    // Collections list what this reader may see in the library, not what the workspace holds.
    as: caller,
  });
  return ok({ data: view });
});
