import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { deliverableSql, stateSql } from "@/lib/core/assets";
import { latestVersion, listUpdates, publishedVersion, snapshot } from "@/lib/core/brand";
import { resolveBrand } from "@/lib/core/brands";
import { AssetError } from "@/lib/core/errors";
import { pageSnapshot } from "@/lib/core/page-store";
import type { Caller } from "@/lib/core/access";
import { collectionItems, presentAsset, type Sign } from "@/lib/core/section-assets";
import { deriveTheme } from "@/lib/brand-theme";
import { planView, type Level, type Source } from "@/lib/page-view";
import { assetRefs, liveProps } from "@/lib/pages";
import type { PortalPreset } from "@/lib/portal";
import { hasPreview } from "@/lib/preview";
import { ruleContext } from "@/lib/rules";
import { signUrlsIn } from "@/lib/signed";
import type { PageView, ViewRule } from "@/lib/site";

/**
 * A brand page as a reader gets it (lib/site.ts PageView): planned by
 * lib/page-view.ts, which decides what this reader may see, then hydrated
 * here. Only what the plan let through is looked up, and only what may be
 * used (lib/lifecycle.ts deliverable) is described and signed. The in-app
 * reader, the builder canvas and portals all come through here.
 */

export type BrandSource = Source & { brandId: string; workspaceId: string };

/** The brand as it stands now, unpublished: its rules, pages and theme. */
export async function draftSource(ws: string, brandSlug?: string): Promise<BrandSource> {
  const b = await resolveBrand(ws, brandSlug);
  const [rules, pages] = await Promise.all([snapshot(db, b.id), pageSnapshot(db, b.id)]);
  return { brand: { slug: b.slug, name: b.name }, rules, pages, theme: b.theme, version: null, brandId: b.id, workspaceId: ws };
}

/**
 * The brand as portals show it (D15): its latest publish. A brand with no
 * history at all shows as it stands, which is what its baseline will be;
 * one with history and no publish shows nothing (null).
 */
export async function publishedSource(ws: string, brandSlug?: string): Promise<BrandSource | null> {
  const b = await resolveBrand(ws, brandSlug);
  const v = await publishedVersion(db, b.id);
  if (!v) return (await latestVersion(db, b.id)) ? null : draftSource(ws, b.slug);
  return {
    brand: { slug: b.slug, name: b.name },
    rules: v.snapshot,
    pages: v.pages,
    // A version from before themes reads as the empty theme, as tracked reads it.
    theme: v.theme ?? {},
    version: { number: v.number, publishedAt: v.publishedAt!.toISOString() },
    brandId: b.id,
    workspaceId: ws,
  };
}

/** Why a reader won't see an asset, for the editor's warning. */
const why = (state: string) => (state === "active" ? "under embargo" : state);

/**
 * One page of `src` for a reader at `level`; no slug, the first they may open.
 * An old slug gives the page it names now, with `redirect` set. `sign` signs
 * URLs for visitors without a session; members' own session opens them.
 */
export async function viewPage(
  ws: string,
  src: BrandSource,
  slug: string | null,
  o: { context?: string; lang?: string; level: Level; sign: Sign; presets: PortalPreset[]; as?: Caller },
): Promise<PageView> {
  if (o.context !== undefined && !ruleContext.safeParse(o.context).success) {
    throw new AssetError("invalid", `Not a context: "${o.context}". Contexts are slugs, e.g. dark-background`);
  }
  const plan = planView(src, slug, o);
  if (plan.kind === "missing") throw new AssetError("not_found", `No page "${slug}" in ${src.brand.slug}`);
  if (plan.kind === "redirect") return { ...(await viewPage(ws, src, plan.slug, o)), redirect: plan.slug };
  const { view } = plan;
  const editor = o.level === "editor";
  const updates = plan.updates > 0 ? await listUpdates(src.brandId, plan.updates) : undefined;

  // Every asset in one query, the publishes' pictures too. Preview equals portal: editors see what readers see, and are told what they don't.
  const ids = [...new Set([...plan.assets, ...(updates ?? []).flatMap((u) => u.image ?? [])])];
  const rows = ids.length
    ? await db
        .select({ asset: assets, ok: sql<boolean>`${deliverableSql}`, state: stateSql })
        .from(assets)
        .where(and(inArray(assets.id, ids), eq(assets.workspaceId, ws)))
    : [];
  const usable = new Map(rows.filter((r) => r.ok).map((r) => [r.asset.id, r.asset]));
  const media = Object.fromEntries([...usable.values()].map((a) => [a.id, presentAsset(a, o)]));
  const rules: ViewRule[] = view.rules.map((r) => ({
    ...r,
    assets: r.assets.flatMap(({ id, rendition }) => {
      const a = usable.get(id);
      if (!a) return [];
      return [{ id, rendition, title: a.metadata?.title ?? null, filename: a.filename, mime: a.mime, size: a.size, width: a.width, height: a.height, preview: hasPreview(a), supersededBy: a.supersededBy }];
    }),
  }));

  const dropped: string[] = [];
  if (editor) {
    const found = new Map(rows.map((r) => [r.asset.id, r]));
    const refs = [
      ...view.rules.flatMap((r) => r.assets.map((a) => ({ id: a.id, at: r.context ? `${r.key} (${r.context})` : r.key }))),
      ...(view.page ? assetRefs(view.page) : []),
    ];
    for (const { id, at } of refs) {
      if (usable.has(id)) continue;
      const r = found.get(id);
      dropped.push(`${at}: ${r ? `${r.asset.filename} is ${why(r.state)}` : `asset ${id} is gone`}; readers won't see it`);
    }
  }

  const collections = Object.fromEntries(
    await Promise.all(
      plan.collections.map(async (s) => {
        const got = await collectionItems(ws, liveProps(s), o);
        // The reason is for editors: it can name the workspace's collections.
        return [s.id, editor ? got : { ...got, error: null }] as const;
      }),
    ),
  );

  const sign = o.sign;
  const signed = sign
    ? Object.fromEntries([...usable.keys(), ...Object.values(collections).flatMap((c) => c.items.map((m) => m.id))].map((id) => [id, sign(id)]))
    : {};
  // Pictures pasted into text load for visitors too.
  const signIn = <T>(x: T): T => (sign ? (JSON.parse(signUrlsIn(JSON.stringify(x), (id) => signed[id] ?? null)) as T) : x);

  // The planner can't tell a font file by its id; described, the theme's faces name the files readers may load.
  const described = new Map(rules.flatMap((r) => r.assets.map((a) => [a.id, a] as const)));
  const theme = deriveTheme(
    src.rules.map((r) => ({ ...r, assets: r.assets.flatMap((a) => described.get(a.id) ?? []) })),
    src.theme,
  );

  return {
    ...view,
    theme: { ...theme, settings: src.theme },
    page: view.page && { ...view.page, sections: signIn(view.page.sections) },
    rules: signIn(rules),
    media,
    collections,
    // A publish's picture shows only while it may be used, like any other.
    ...(updates && { updates: updates.map((u) => ({ ...u, image: u.image && usable.has(u.image) ? u.image : null })) }),
    signed,
    warnings: [...view.warnings, ...dropped],
  };
}
