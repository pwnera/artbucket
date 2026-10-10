import { ok, route } from "@/lib/api";
import { AssetError } from "@/lib/core/errors";
import { draftSource, findOf, publishedSource, viewPage } from "@/lib/core/page-view";
import { can, needs } from "@/lib/permissions";
import { DEFAULT_PRESETS } from "@/lib/portal";

type P = { slug: string };

/**
 * GET /api/v1/brands/{slug}/view?page=logo&context=dark-background - a page
 * of the draft as readers with every door open see it, ready to render: the
 * nav, its sections, the rules and assets they show, its collections filled.
 * No page: the first. An old slug gives the page with `redirect` set.
 * `edit=1` (write): hidden pages and sections too, and the warnings.
 * `in={section}&find=words`: that collection section's assets narrowed to
 * the words, as a reader's search in it asks. `version=live`: the release
 * readers see instead of the draft; not found before the first.
 */
export const GET = route<P>("brand.read", async (req, { slug }, caller) => {
  const q = new URL(req.url).searchParams;
  const edit = q.get("edit") === "1";
  if (edit && !can(caller, "brand.edit")) throw new AssetError("forbidden", `Editing takes ${needs("brand.edit")}`);
  const ws = caller.project.id;
  const src = q.get("version") === "live" ? await publishedSource(ws, slug) : await draftSource(ws, slug);
  if (!src) throw new AssetError("not_found", "Never released: only the draft can be read");
  const view = await viewPage(ws, src, q.get("page") || null, {
    context: q.get("context") || undefined,
    lang: q.get("lang") || undefined,
    level: edit ? "editor" : "members",
    sign: null,
    presets: DEFAULT_PRESETS,
    // Collections list what this reader may see in the library, not what the project holds.
    as: caller,
    ...findOf(q),
  });
  return ok({ data: view });
});
