import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, brandPages } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { visible } from "@/lib/core/assets";
import { listRules } from "@/lib/core/brand";
import { resolveBrand } from "@/lib/core/brands";
import { idsIn } from "@/lib/pages";
import { hasPreview } from "@/lib/preview";

/**
 * GET /api/v1/brands/{slug}/assets: the files a brand uses, for its Assets
 * tab. Its rules' files, in the rules' order, then the ones its pages show
 * (a cover, an image, a video, a file: lib/pages.ts idsIn), each with the
 * rules and pages it is in. Only what this caller may see, and not deleted.
 * ponytail: reads every page's sections; an index of what pages show once
 * brands have hundreds of pages.
 */
export async function brandAssets(caller: Caller, slug: string) {
  const ws = caller.workspace.id;
  const b = await resolveBrand(ws, slug);
  const [rules, pages] = await Promise.all([
    listRules(ws, { brand: b.slug }),
    db
      .select({ slug: brandPages.slug, title: brandPages.title, cover: brandPages.cover, sections: brandPages.sections })
      .from(brandPages)
      .where(eq(brandPages.brandId, b.id))
      .orderBy(asc(brandPages.position)),
  ]);
  const uses = new Map<string, { rules: Set<string>; pages: Map<string, string> }>();
  const usage = (id: string) => uses.get(id) ?? uses.set(id, { rules: new Set(), pages: new Map() }).get(id)!;
  for (const r of rules) for (const a of r.assets) usage(a.id).rules.add(r.key);
  for (const p of pages) for (const id of idsIn(p)) usage(id).pages.set(p.slug, p.title);
  const ids = [...uses.keys()];
  const rows = ids.length
    ? await db
        .select({ id: assets.id, filename: assets.filename, metadata: assets.metadata, mime: assets.mime, width: assets.width, height: assets.height, probe: assets.probe })
        .from(assets)
        .where(and(inArray(assets.id, ids), isNull(assets.deletedAt), visible(caller)))
    : [];
  const byId = new Map(rows.map((a) => [a.id, a]));
  return ids.flatMap((id) => {
    const a = byId.get(id);
    const u = uses.get(id)!;
    return a
      ? [
          {
            id,
            title: a.metadata?.title || a.filename,
            filename: a.filename,
            mime: a.mime,
            width: a.width,
            height: a.height,
            preview: hasPreview(a),
            rules: [...u.rules],
            pages: [...u.pages].map(([slug, title]) => ({ slug, title })),
          },
        ]
      : [];
  });
}
