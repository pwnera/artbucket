import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { assets, brandPages, savedSearches } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { parseAssetQuery } from "@/lib/core/assets";
import { listRules, tracked, type BrandRule, type Tx } from "@/lib/core/brand";
import { resolveBrand } from "@/lib/core/brands";
import { getCollection } from "@/lib/core/collections";
import { AssetError } from "@/lib/core/errors";
import { PAGE_ORDER } from "@/lib/core/page-store";
import { checkBindings, initialPages, issues, pageMarkdown, parseSections, type PageInput, type PageOp, type Section } from "@/lib/pages";
import { resolve } from "@/lib/rules";

/**
 * A brand's pages (lib/pages.ts): read, saved whole, edited an operation at a
 * time, laid out from the rules. Every write is checked all at once, so an
 * agent gets every problem with its path in one answer, and lands in the
 * brand's history like a rule change does. REST, MCP and the editor all come
 * through here.
 */

type Row = typeof brandPages.$inferSelect;

const present = (p: Row) => ({ slug: p.slug, title: p.title, position: p.position, hidden: p.hidden, sections: p.sections, updatedAt: p.updatedAt });
export type BrandPage = ReturnType<typeof present>;

/** A write's problems, all of them, as one error an agent can act on. */
function refuse(errors: string[]) {
  if (errors.length) throw new AssetError("invalid", errors.join("\n"));
}

async function pageRow(tx: Tx | typeof db, brandId: string, slug: string) {
  const [p] = await tx
    .select()
    .from(brandPages)
    .where(and(eq(brandPages.brandId, brandId), eq(brandPages.slug, slug)));
  return p;
}

/**
 * What the library must have for these sections: the collections and saved
 * searches they draw from, their queries (parsed as the library parses them),
 * and the images they name.
 */
async function checkRefs(caller: Caller, sections: Section[], prefix: string) {
  const errors: string[] = [];
  const images = new Map<string, string>();
  for (const [i, s] of sections.entries()) {
    const at = `${prefix}[${i}].props`;
    const p = s.props as { image?: string; collection?: string; search?: string; query?: string };
    if (p.image) images.set(p.image, `${at}.image`);
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
  if (images.size) {
    const found = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.workspaceId, caller.workspace.id), isNull(assets.deletedAt), inArray(assets.id, [...images.keys()])));
    for (const [id, at] of images) if (!found.some((f) => f.id === id)) errors.push(`${at}: no asset ${id}`);
  }
  return errors;
}

/** Every check a page's sections must pass before they are written. `had`: the keys the page bound before. */
async function check(caller: Caller, brandSlug: string, sections: Section[], had: Set<string>, prefix = "sections") {
  const rules = await listRules(caller.workspace.id, { brand: brandSlug });
  refuse([...checkBindings(sections, rules, had, prefix), ...(await checkRefs(caller, sections, prefix))]);
}

/** Put `slug` at `position` among the brand's pages, and number them all again from 0. */
async function place(tx: Tx, brandId: string, slug: string, position: number | undefined) {
  const rows = await tx.select({ id: brandPages.id, slug: brandPages.slug }).from(brandPages).where(eq(brandPages.brandId, brandId)).orderBy(...PAGE_ORDER);
  const order = rows.filter((r) => r.slug !== slug);
  const me = rows.find((r) => r.slug === slug)!;
  order.splice(position === undefined ? rows.indexOf(me) : Math.min(position, order.length), 0, me);
  for (const [i, r] of order.entries()) await tx.update(brandPages).set({ position: i }).where(eq(brandPages.id, r.id));
}

// ---- reads ------------------------------------------------------------------

/** A brand's pages in order, without their sections. */
export async function listPages(ws: string, brandSlug?: string) {
  const brand = await resolveBrand(ws, brandSlug);
  const rows = await db.select().from(brandPages).where(eq(brandPages.brandId, brand.id)).orderBy(...PAGE_ORDER);
  return {
    brand: brand.slug,
    pages: rows.map((p) => ({ slug: p.slug, title: p.title, position: p.position, hidden: p.hidden, sections: p.sections.length, updatedAt: p.updatedAt })),
  };
}

/**
 * One page with the rules its sections show, resolved for `context`, and as
 * Markdown. `missing`: keys a section binds whose rule has gone since.
 */
export async function getPage(ws: string, brandSlug: string | undefined, slug: string, context?: string) {
  const brand = await resolveBrand(ws, brandSlug);
  const p = await pageRow(db, brand.id, slug);
  if (!p) throw new AssetError("not_found", `No page "${slug}" in ${brand.slug}`);
  const all = await listRules(ws, { brand: brand.slug });
  const bound = new Set(p.sections.flatMap((s) => s.keys));
  // listRules checks the context and resolves it; with none, the defaults.
  const rules = (context === undefined ? resolve(all, "") : await listRules(ws, { brand: brand.slug, context })).filter((r) => bound.has(r.key));
  return {
    brand: brand.slug,
    context: context ?? null,
    page: present(p),
    rules,
    missing: [...bound].filter((k) => !all.some((r) => r.key === k)),
    markdown: pageMarkdown(p, rules),
  };
}

// ---- writes -----------------------------------------------------------------

/**
 * Make a page, or replace one, whole: its title, place and every section, top
 * to bottom. Sections keep the ids they are given; new ones get one.
 */
export async function savePage(caller: Caller, brandSlug: string | undefined, slug: string, input: z.output<typeof PageInput>) {
  const brand = await resolveBrand(caller.workspace.id, brandSlug);
  const { sections, errors } = parseSections(input.sections);
  refuse(errors);
  const before = await pageRow(db, brand.id, slug);
  await check(caller, brand.slug, sections, new Set(before?.sections.flatMap((s) => s.keys)));
  return tracked(brand.id, caller.actor, [], async (tx) => {
    const now = await pageRow(tx, brand.id, slug);
    const set = { title: input.title, sections, ...(input.hidden !== undefined && { hidden: input.hidden }) };
    if (now) await tx.update(brandPages).set({ ...set, updatedAt: sql`now()` }).where(eq(brandPages.id, now.id));
    else await tx.insert(brandPages).values({ brandId: brand.id, slug, position: 1e6, ...set });
    await place(tx, brand.id, slug, input.position);
    return { brand: brand.slug, created: !now, page: present((await pageRow(tx, brand.id, slug))!) };
  });
}


/**
 * Edit a page's sections an operation at a time, in order: add, update, move,
 * remove. All of them or none: the page is checked once, after the last.
 */
export async function editPage(caller: Caller, brandSlug: string | undefined, slug: string, ops: PageOp[]) {
  const brand = await resolveBrand(caller.workspace.id, brandSlug);
  const before = await pageRow(db, brand.id, slug);
  if (!before) throw new AssetError("not_found", `No page "${slug}" in ${brand.slug}; save_page makes one`);
  const sections = [...before.sections];
  const taken = new Set(sections.map((s) => s.id));
  const errors: string[] = [];
  const fresh = (ids: Set<string>) => {
    let id = "";
    do id = `s${Math.random().toString(36).slice(2, 10)}`;
    while (ids.has(id));
    return id;
  };
  const at = (id: string, i: number) => {
    const n = sections.findIndex((s) => s.id === id);
    if (n < 0) errors.push(`ops[${i}]: no section "${id}" on ${slug}; its sections are ${sections.map((s) => s.id).join(", ") || "none"}`);
    return n;
  };
  /** Where "after" puts a section: null the top, undefined the end. */
  const slot = (after: string | null | undefined, i: number) => (after === null ? 0 : after === undefined ? sections.length : at(after, i) + 1);
  for (const [i, op] of ops.entries()) {
    if (op.op === "add") {
      if (op.section.id && taken.has(op.section.id)) errors.push(`ops[${i}].section.id: "${op.section.id}" is taken on ${slug}`);
      // Parsed alone, so its new id is checked against the page's here.
      const [made] = parseSections([op.section]).sections.map((x) => (op.section.id ? x : { ...x, id: fresh(taken) }));
      const to = slot(op.after, i);
      if (made) sections.splice(Math.max(to, 0), 0, made);
      if (made) taken.add(made.id);
    } else if (op.op === "update") {
      const n = at(op.id, i);
      if (n < 0) continue;
      const { sections: made, errors: bad } = parseSections([{ ...sections[n], ...op.set, id: op.id }], `ops[${i}].set`);
      errors.push(...bad.map((e) => e.replace(`ops[${i}].set[0]`, `ops[${i}].set`)));
      if (made[0]) sections[n] = made[0];
    } else if (op.op === "move") {
      const n = at(op.id, i);
      if (n < 0) continue;
      const [s] = sections.splice(n, 1);
      const to = slot(op.after, i);
      sections.splice(Math.max(to, 0), 0, s);
    } else {
      const n = at(op.id, i);
      if (n >= 0) sections.splice(n, 1);
    }
  }
  refuse(errors);
  await check(caller, brand.slug, sections, new Set(before.sections.flatMap((s) => s.keys)));
  return tracked(brand.id, caller.actor, [], async (tx) => {
    const [row] = await tx.update(brandPages).set({ sections, updatedAt: sql`now()` }).where(eq(brandPages.id, before.id)).returning();
    return { brand: brand.slug, page: present(row) };
  });
}

export async function deletePage(caller: Caller, brandSlug: string | undefined, slug: string) {
  const brand = await resolveBrand(caller.workspace.id, brandSlug);
  return tracked(brand.id, caller.actor, [], async (tx) => {
    const gone = await tx
      .delete(brandPages)
      .where(and(eq(brandPages.brandId, brand.id), eq(brandPages.slug, slug)))
      .returning();
    if (!gone.length) throw new AssetError("not_found", `No page "${slug}" in ${brand.slug}`);
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
