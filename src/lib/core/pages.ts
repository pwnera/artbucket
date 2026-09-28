import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { assets, brandPages, savedSearches } from "@/lib/db/schema";
import { env } from "@/lib/env";
import type { Caller } from "@/lib/core/access";
import { parseAssetQuery } from "@/lib/core/assets";
import { listRules, refuse, tracked, type BrandRule, type Tx } from "@/lib/core/brand";
import { resolveBrand, type Brand } from "@/lib/core/brands";
import { getCollection } from "@/lib/core/collections";
import { AssetError } from "@/lib/core/errors";
import { PAGE_ORDER, toSnap, type PageRow } from "@/lib/core/page-store";
import {
  applyOps,
  assetRefs,
  boundKeys,
  canon,
  checkBindings,
  checkTree,
  initialPages,
  issues,
  MAX_PAGES,
  pageMarkdown,
  pageSlug,
  pageWarnings,
  parseSections,
  type PageInput,
  type PageOp,
  type PagePatch,
  type Section,
} from "@/lib/pages";
import { resolve } from "@/lib/rules";

/**
 * A brand's pages (lib/pages.ts): read, saved whole, edited an operation at a
 * time, laid out from the rules. Pages nest by slug, and a renamed page keeps
 * its old slug as an alias. Every write is checked all at once, so an agent
 * gets every problem with its path in one answer, and lands in the brand's
 * history like a rule change does. REST, MCP and the editor all come through here.
 */

const present = (p: PageRow) => ({
  slug: p.slug,
  title: p.title,
  position: p.position,
  hidden: p.hidden,
  parent: p.parent,
  eyebrow: p.eyebrow,
  lede: p.lede,
  cover: p.cover,
  icon: p.icon,
  audience: p.audience,
  tabs: p.tabs,
  layout: p.layout,
  // Editors read back what they wrote in other languages; readers get theirs through the view.
  ...(p.translations && { translations: p.translations }),
  aliases: p.aliases,
  sections: p.sections,
  updatedAt: p.updatedAt,
});
export type BrandPage = ReturnType<typeof present>;

/** Where a member reads the page in the app (D18): get_page and every write return it. */
const readerUrl = (brand: string, page: string, context?: string) =>
  `${env.APP_URL}/brand?${new URLSearchParams({ brand, page, ...(context && { context }), view: "read" })}`;

const boundOf = (sections: Section[]) => new Set(sections.flatMap(boundKeys));

/** Pages that name `slug` among their old slugs. */
const aliasOf = (slug: string) => sql`${slug} = any(${brandPages.aliases})`;

async function pageRow(tx: Tx | typeof db, brandId: string, slug: string) {
  const [p] = await tx
    .select()
    .from(brandPages)
    .where(and(eq(brandPages.brandId, brandId), eq(brandPages.slug, slug)));
  return p;
}

/** No page `slug`; when it was renamed, the error says what it is called now, so an agent doesn't make it again. */
async function noPage(brandId: string, brand: string, slug: string, then = "") {
  const [now] = await db
    .select({ slug: brandPages.slug })
    .from(brandPages)
    .where(and(eq(brandPages.brandId, brandId), aliasOf(slug)));
  return new AssetError("not_found", now ? `No page "${slug}" in ${brand}: it is "${now.slug}" now` : `No page "${slug}" in ${brand}${then}`);
}

/**
 * What the library must have for this page: the collections and saved
 * searches its sections draw from, their queries (parsed as the library
 * parses them), and every asset it names, cover to items.
 */
async function checkRefs(caller: Caller, page: { cover?: string | null; sections: Section[] }) {
  const errors: string[] = [];
  for (const [i, s] of page.sections.entries()) {
    const at = `sections[${i}].props`;
    const p = s.props as { collection?: string; search?: string; query?: string };
    if (p.collection && !(await getCollection(caller, p.collection))) errors.push(`${at}.collection: no collection ${p.collection}`);
    if (p.search) {
      const [found] = await db
        .select({ id: savedSearches.id })
        .from(savedSearches)
        .where(and(eq(savedSearches.id, p.search), eq(savedSearches.workspaceId, caller.workspace.id)));
      if (!found) errors.push(`${at}.search: no saved search ${p.search}`);
    }
    if (p.query !== undefined) {
      try {
        await parseAssetQuery(caller, new URLSearchParams(p.query.replace(/^\?/, "")));
      } catch (err) {
        if (err instanceof AssetError) errors.push(`${at}.query: ${err.message}`);
        else if (err instanceof z.ZodError) errors.push(...issues(err, `${at}.query`));
        else throw err;
      }
    }
  }
  const refs = assetRefs(page);
  if (refs.length) {
    const found = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.workspaceId, caller.workspace.id), isNull(assets.deletedAt), inArray(assets.id, [...new Set(refs.map((r) => r.id))])));
    const live = new Set(found.map((f) => f.id));
    for (const r of refs) if (!live.has(r.id)) errors.push(`${r.at}: no asset ${r.id}`);
  }
  return errors;
}

/**
 * Every check a page must pass before it is written. `had`: the keys the page
 * bound before. Returns the brand's rules, for the page's warnings.
 */
async function check(caller: Caller, brandSlug: string, page: { cover?: string | null; sections: Section[] }, had: Set<string>) {
  const rules = await listRules(caller.workspace.id, { brand: brandSlug });
  refuse([...checkBindings(page.sections, rules, had), ...(await checkRefs(caller, page))]);
  return rules;
}

/** What a reader would trip on in the page as written: links that go nowhere, keys with no rule. */
async function warnings(tx: Tx, brandId: string, page: PageRow, rules: BrandRule[]) {
  return pageWarnings(page, await tx.select().from(brandPages).where(eq(brandPages.brandId, brandId)), rules);
}

/** The page's own fields a save or a `page` op sets: left out keeps, null clears, and empty text is none. */
const pageMeta = (m: Omit<PagePatch, "title" | "hidden" | "position" | "slug">) => ({
  ...(m.parent !== undefined && { parent: m.parent }),
  ...(m.eyebrow !== undefined && { eyebrow: m.eyebrow || null }),
  ...(m.lede !== undefined && { lede: m.lede || null }),
  ...(m.cover !== undefined && { cover: m.cover }),
  ...(m.icon !== undefined && { icon: m.icon }),
  ...(m.audience !== undefined && { audience: m.audience }),
  ...(m.tabs !== undefined && { tabs: m.tabs }),
  ...(m.layout !== undefined && { layout: m.layout }),
  // None set is none: an empty record would only change the page's canon.
  ...(m.translations !== undefined && { translations: m.translations && Object.keys(m.translations).length ? m.translations : null }),
});

/** A slug a page takes is no longer another page's old name: links to it now reach the page that has it. */
const takeSlug = (tx: Tx, brandId: string, slug: string) =>
  tx
    .update(brandPages)
    .set({ aliases: sql`array_remove(${brandPages.aliases}, ${slug})` })
    .where(and(eq(brandPages.brandId, brandId), aliasOf(slug)));

/** Move `updatedAt` only when what the page says changed (1.2): saving it as it is, or moving it, is not a change. */
async function touch(tx: Tx, before: PageRow, after: PageRow) {
  const said = (p: PageRow) => canon({ ...toSnap(p), position: undefined, updatedAt: undefined });
  if (said(before) !== said(after)) await tx.update(brandPages).set({ updatedAt: sql`now()` }).where(eq(brandPages.id, after.id));
}

/**
 * Number the brand's pages again from 0, with `slug` put at `position`. No
 * gaps, so saving a page as it is never moves the ones after it.
 */
async function place(tx: Tx, brandId: string, slug?: string, position?: number) {
  const rows = await tx.select({ id: brandPages.id, slug: brandPages.slug }).from(brandPages).where(eq(brandPages.brandId, brandId)).orderBy(...PAGE_ORDER);
  const me = rows.find((r) => r.slug === slug);
  const order = rows.filter((r) => r !== me);
  if (me) order.splice(position === undefined ? rows.indexOf(me) : Math.min(position, order.length), 0, me);
  for (const [i, r] of order.entries()) await tx.update(brandPages).set({ position: i }).where(eq(brandPages.id, r.id));
}

// ---- reads ------------------------------------------------------------------

/** A brand's pages in order, with their tree fields and without their sections. */
export async function listPages(ws: string, brandSlug?: string) {
  const brand = await resolveBrand(ws, brandSlug);
  const rows = await db.select().from(brandPages).where(eq(brandPages.brandId, brand.id)).orderBy(...PAGE_ORDER);
  return {
    brand: brand.slug,
    pages: rows.map((p) => {
      const { sections, ...rest } = present(p);
      return { ...rest, sections: sections.length };
    }),
  };
}

/**
 * One page with the rules its sections show, resolved for `context`, and as
 * Markdown. A slug it had before a rename finds it too. `missing`: keys a
 * section binds whose rule has gone since; `warnings`: what a reader would trip on.
 */
export async function getPage(ws: string, brandSlug: string | undefined, slug: string, context?: string) {
  const brand = await resolveBrand(ws, brandSlug);
  const pages = await db.select().from(brandPages).where(eq(brandPages.brandId, brand.id));
  const p = pages.find((x) => x.slug === slug) ?? pages.find((x) => x.aliases.includes(slug));
  if (!p) throw new AssetError("not_found", `No page "${slug}" in ${brand.slug}`);
  const all = await listRules(ws, { brand: brand.slug });
  const bound = boundOf(p.sections);
  // listRules checks the context and resolves it; with none, the defaults.
  const rules = (context === undefined ? resolve(all, "") : await listRules(ws, { brand: brand.slug, context })).filter((r) => bound.has(r.key));
  return {
    brand: brand.slug,
    context: context ?? null,
    page: present(p),
    rules,
    missing: [...bound].filter((k) => !all.some((r) => r.key === k)),
    warnings: pageWarnings(p, pages, all),
    markdown: pageMarkdown(p, rules),
    url: readerUrl(brand.slug, p.slug, context),
  };
}

// ---- writes -----------------------------------------------------------------

/**
 * Make a page, or replace one, whole: its title, place, page fields and every
 * section, top to bottom. Sections keep the ids they are given; new ones get
 * one. A page field left out keeps its value; null clears it.
 */
export async function savePage(caller: Caller, brandSlug: string | undefined, slug: string, input: z.output<typeof PageInput>) {
  const brand = await resolveBrand(caller.workspace.id, brandSlug);
  const named = pageSlug.safeParse(slug);
  refuse(named.success ? [] : issues(named.error, "page"));
  const { sections, errors } = parseSections(input.sections);
  refuse(errors);
  const before = await pageRow(db, brand.id, slug);
  const rules = await check(caller, brand.slug, { cover: input.cover, sections }, boundOf(before?.sections ?? []));
  return tracked(brand.id, caller.actor, [], async (tx) => {
    const now = await pageRow(tx, brand.id, slug);
    const tree = await tx.select({ slug: brandPages.slug, parent: brandPages.parent }).from(brandPages).where(eq(brandPages.brandId, brand.id));
    if (!now && tree.length >= MAX_PAGES) throw new AssetError("invalid", `${brand.slug} has ${MAX_PAGES} pages, the most a brand holds`);
    const parent = input.parent !== undefined ? input.parent : (now?.parent ?? null);
    refuse(checkTree([...tree.filter((p) => p.slug !== slug), { slug, parent }]));
    const set = { title: input.title, sections, ...pageMeta(input), ...(input.hidden !== undefined && { hidden: input.hidden }) };
    if (now) {
      const [row] = await tx.update(brandPages).set(set).where(eq(brandPages.id, now.id)).returning();
      await touch(tx, now, row);
    } else {
      await takeSlug(tx, brand.id, slug);
      await tx.insert(brandPages).values({ brandId: brand.id, slug, position: 1e6, ...set });
    }
    await place(tx, brand.id, slug, input.position);
    const page = (await pageRow(tx, brand.id, slug))!;
    return { brand: brand.slug, created: !now, page: present(page), warnings: await warnings(tx, brand.id, page, rules), url: readerUrl(brand.slug, slug) };
  });
}

/**
 * Edit a page an operation at a time, in order: add, update, move and remove
 * sections, and `page` ops for its own fields. All of them or none: the page
 * is checked once, after the last. A new slug renames it: the old one becomes
 * an alias, and its child pages follow it.
 */
export async function editPage(caller: Caller, brandSlug: string | undefined, slug: string, ops: PageOp[]) {
  const brand = await resolveBrand(caller.workspace.id, brandSlug);
  // The checks read the library, so they run before the brand's lock is taken. An edit that lands
  // in between would be written over: the ops are applied again to what it wrote instead.
  for (let tries = 1; ; tries++) {
    const out = await editOnce(caller, brand, slug, ops);
    if (out) return out;
    if (tries === 3) throw new AssetError("conflict", `${slug} kept changing while this edit was checked; send it again`);
  }
}

/** One try at editPage; null when the page's sections changed after they were read. */
async function editOnce(caller: Caller, brand: Brand, slug: string, ops: PageOp[]) {
  const before = await pageRow(db, brand.id, slug);
  if (!before) throw await noPage(brand.id, brand.slug, slug, "; save_page makes one");
  const { sections, page: patch, errors } = applyOps(before.sections, ops, slug);
  refuse(errors);
  const rules = await check(caller, brand.slug, { cover: patch.cover, sections }, boundOf(before.sections));
  const to = patch.slug ?? slug;
  return tracked(brand.id, caller.actor, [], async (tx) => {
    const now = await pageRow(tx, brand.id, slug);
    // Gone or renamed since: the next try's read says which.
    if (!now || canon(now.sections) !== canon(before.sections)) return null;
    const tree = await tx.select({ slug: brandPages.slug, parent: brandPages.parent }).from(brandPages).where(eq(brandPages.brandId, brand.id));
    if (to !== slug && tree.some((p) => p.slug === to)) throw new AssetError("conflict", `A page "${to}" exists in ${brand.slug}`);
    // The tree as it will stand: this page renamed and moved, its children under its new slug.
    refuse(
      checkTree(
        tree.map((p) =>
          p.slug === slug ? { slug: to, parent: patch.parent !== undefined ? patch.parent : p.parent } : { slug: p.slug, parent: p.parent === slug ? to : p.parent },
        ),
      ),
    );
    if (to !== slug) {
      await takeSlug(tx, brand.id, to);
      await tx
        .update(brandPages)
        .set({ parent: to })
        .where(and(eq(brandPages.brandId, brand.id), eq(brandPages.parent, slug)));
    }
    const [row] = await tx
      .update(brandPages)
      .set({
        sections,
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.hidden !== undefined && { hidden: patch.hidden }),
        ...pageMeta(patch),
        // The newest 20 old slugs keep working.
        ...(to !== slug && { slug: to, aliases: [...new Set([...now.aliases, slug])].filter((a) => a !== to).slice(-20) }),
      })
      .where(eq(brandPages.id, now.id))
      .returning();
    await touch(tx, now, row);
    if (patch.position !== undefined) await place(tx, brand.id, to, patch.position);
    const page = (await pageRow(tx, brand.id, to))!;
    return { brand: brand.slug, page: present(page), warnings: await warnings(tx, brand.id, page, rules), url: readerUrl(brand.slug, to) };
  });
}

/** Delete a page. One with pages under it stays until they are moved or deleted: a tree never loses a branch silently. */
export async function deletePage(caller: Caller, brandSlug: string | undefined, slug: string) {
  const brand = await resolveBrand(caller.workspace.id, brandSlug);
  return tracked(brand.id, caller.actor, [], async (tx) => {
    const children = await tx
      .select({ slug: brandPages.slug })
      .from(brandPages)
      .where(and(eq(brandPages.brandId, brand.id), eq(brandPages.parent, slug)))
      .orderBy(...PAGE_ORDER);
    if (children.length) {
      const n = children.length === 1 ? "its page" : `its ${children.length} pages`;
      throw new AssetError("conflict", `${slug} has pages under it (${children.map((c) => c.slug).join(", ")}): move or delete ${n} first`);
    }
    const gone = await tx
      .delete(brandPages)
      .where(and(eq(brandPages.brandId, brand.id), eq(brandPages.slug, slug)))
      .returning();
    if (!gone.length) throw await noPage(brand.id, brand.slug, slug);
    // Close the gap now, in this version, rather than in the next save's.
    await place(tx, brand.id);
    return { brand: brand.slug, deleted: slug };
  });
}

/**
 * Lay out a brand with no pages from its rules (lib/pages.ts initialPages):
 * the start an agent or a person edits from. A brand with pages is left alone.
 */
export async function generatePages(caller: Caller, brandSlug?: string) {
  const brand = await resolveBrand(caller.workspace.id, brandSlug);
  const rules: BrandRule[] = await listRules(caller.workspace.id, { brand: brand.slug });
  const drafts = initialPages(rules, brand.name);
  const made = drafts.map((d, position) => {
    const { sections, errors } = parseSections(d.sections, d.slug);
    if (errors.length) throw new Error(`initialPages made a page that doesn't parse: ${errors.join("; ")}`);
    return { brandId: brand.id, slug: d.slug, title: d.title, position, sections };
  });
  return tracked(brand.id, caller.actor, [], async (tx) => {
    const [has] = await tx.select({ id: brandPages.id }).from(brandPages).where(eq(brandPages.brandId, brand.id)).limit(1);
    if (has) throw new AssetError("conflict", `${brand.slug} has pages already; edit them, or delete them first`);
    await tx.insert(brandPages).values(made);
    return { brand: brand.slug, pages: made.map((p) => ({ slug: p.slug, title: p.title, sections: p.sections.length })) };
  });
}
