import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { brandComments, brandPages } from "@/lib/db/schema";
import type { Caller } from "@/lib/core/access";
import { resolveBrand, type Brand } from "@/lib/core/brands";
import { AssetError } from "@/lib/core/errors";
import { pageNow, threads } from "@/lib/comments";
import { can, needs, type Action } from "@/lib/permissions";
import type { CommentCreate, CommentPatch } from "@/lib/schemas";

/**
 * Review comments on a brand's pages (lib/comments.ts threads them): someone
 * pins a comment to a section, or to a page as a whole, others reply, and
 * whoever may comment resolves the thread or reopens it. Editors read the
 * open ones before they publish. Comments are about the guidelines, not in
 * them: they never land in the brand's history or in front of readers.
 *
 * Reading takes brand.read; writing takes brand.comment. A comment is its
 * author's to edit; deleting someone else's takes brand.edit. A person's is
 * theirs by account, an agent's by its key. Every row is found by its id, its
 * brand and the caller's workspace together, so an id from elsewhere is a 404.
 */

type Row = typeof brandComments.$inferSelect;

/** The API's shape (lib/schemas.ts Comment): `page` as the page is called now. */
const present = (c: Row, caller: Caller, now: (slug: string) => string) => ({
  id: c.id,
  page: now(c.page),
  section: c.section,
  parent: c.parentId,
  body: c.body,
  author: c.author,
  authorId: c.authorId,
  mine: mine(caller, c),
  resolvedAt: c.resolvedAt,
  resolvedBy: c.resolvedBy,
  editedAt: c.editedAt,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});
export type BrandComment = ReturnType<typeof present>;

const mine = (caller: Caller, c: Row) => (!!caller.user && c.authorId === caller.user.id) || (!!caller.key && c.authorKey === caller.key);

function allow(caller: Caller, action: Action) {
  if (!can(caller, action)) throw new AssetError("forbidden", `You need ${needs(action)}`);
}

/** The brand's pages as far as comments read them: where each is now, and what sections it has. */
const pagesOf = (brandId: string) =>
  db.select({ slug: brandPages.slug, aliases: brandPages.aliases, sections: brandPages.sections }).from(brandPages).where(eq(brandPages.brandId, brandId));

/** The page `slug` names: its own, or one it had before a rename. */
const findPage = <P extends { slug: string; aliases: string[] }>(pages: P[], slug: string) =>
  pages.find((p) => p.slug === slug) ?? pages.find((p) => p.aliases.includes(slug));

async function commentRow(caller: Caller, brand: Brand, id: string) {
  const [c] = z.uuid().safeParse(id).success
    ? await db
        .select()
        .from(brandComments)
        .where(and(eq(brandComments.id, id), eq(brandComments.brandId, brand.id), eq(brandComments.workspaceId, caller.workspace.id)))
    : [];
  if (!c) throw new AssetError("not_found", `No comment ${id} in ${brand.slug}`);
  return c;
}

// ---- reads ------------------------------------------------------------------

/**
 * A brand's comments as threads, open ones first (lib/comments.ts threads).
 * With `page`, that page's only, found by an old slug too, and with the
 * comments made on it before its rename.
 */
export async function listComments(caller: Caller, brandSlug: string | undefined, { page }: { page?: string } = {}) {
  const brand = await resolveBrand(caller.workspace.id, brandSlug);
  const pages = await pagesOf(brand.id);
  const where = [eq(brandComments.brandId, brand.id), eq(brandComments.workspaceId, caller.workspace.id)];
  if (page) {
    const p = findPage(pages, page);
    // A page deleted since: its comments are still under the slug it had.
    where.push(inArray(brandComments.page, p ? [p.slug, ...p.aliases] : [page]));
  }
  const rows = await db
    .select()
    .from(brandComments)
    .where(and(...where));
  const now = pageNow(pages);
  return threads(rows.map((c) => present(c, caller, now)));
}

// ---- writes -----------------------------------------------------------------

/**
 * Start a thread on a page, or on a section of it, which must be there; or
 * reply in one (`parent`), where the reply takes its thread's page and
 * section. A reply to a reply joins its thread, and a reply to a resolved
 * thread reopens it: whoever answers has something left to say.
 */
export async function createComment(caller: Caller, brandSlug: string | undefined, input: z.output<typeof CommentCreate>) {
  allow(caller, "brand.comment");
  const brand = await resolveBrand(caller.workspace.id, brandSlug);
  const pages = await pagesOf(brand.id);
  let at: { page: string; section: string | null; parentId: string | null };
  let reopen: Row | null = null;
  if (input.parent) {
    const parent = await commentRow(caller, brand, input.parent);
    const root = parent.parentId ? await commentRow(caller, brand, parent.parentId) : parent;
    at = { page: root.page, section: root.section, parentId: root.id };
    if (root.resolvedAt) reopen = root;
  } else {
    const p = findPage(pages, input.page!);
    if (!p) throw new AssetError("not_found", `No page "${input.page}" in ${brand.slug}`);
    const section = input.section ?? null;
    if (section && !p.sections.some((s) => s.id === section)) throw new AssetError("not_found", `No section "${section}" on ${p.slug}`);
    at = { page: p.slug, section, parentId: null };
  }
  const row = await db.transaction(async (tx) => {
    const [made] = await tx
      .insert(brandComments)
      .values({
        workspaceId: caller.workspace.id,
        brandId: brand.id,
        ...at,
        body: input.body,
        authorId: caller.user?.id ?? null,
        authorKey: caller.key,
        author: caller.actor,
      })
      .returning();
    if (reopen) await tx.update(brandComments).set({ resolvedAt: null, resolvedBy: null, updatedAt: sql`now()` }).where(eq(brandComments.id, reopen.id));
    return made;
  });
  return present(row, caller, pageNow(pages));
}

/**
 * Change a comment: its text, which only its author may, and whether its
 * thread is resolved, which anyone who may comment may, on a thread's first
 * comment only. Resolving a resolved thread keeps who resolved it first.
 */
export async function updateComment(caller: Caller, brandSlug: string | undefined, id: string, patch: z.output<typeof CommentPatch>) {
  allow(caller, "brand.comment");
  const brand = await resolveBrand(caller.workspace.id, brandSlug);
  const c = await commentRow(caller, brand, id);
  if (patch.body !== undefined && !mine(caller, c)) throw new AssetError("forbidden", "Only its author can edit a comment");
  if (patch.resolved !== undefined && c.parentId) throw new AssetError("invalid", "A reply isn't resolved on its own: resolve its thread");
  const edited = patch.body !== undefined && patch.body !== c.body;
  const [row] = await db
    .update(brandComments)
    .set({
      ...(edited && { body: patch.body, editedAt: sql`now()` }),
      ...(patch.resolved === true && !c.resolvedAt && { resolvedAt: sql`now()`, resolvedBy: caller.actor }),
      ...(patch.resolved === false && { resolvedAt: null, resolvedBy: null }),
      updatedAt: sql`now()`,
    })
    .where(eq(brandComments.id, c.id))
    .returning();
  // Deleted since it was read.
  if (!row) throw new AssetError("not_found", `No comment ${id} in ${brand.slug}`);
  return present(row, caller, pageNow(await pagesOf(brand.id)));
}

/** Delete a comment, and with a thread's first one, its replies. One's own, or anyone's with brand.edit. */
export async function deleteComment(caller: Caller, brandSlug: string | undefined, id: string) {
  allow(caller, "brand.comment");
  const brand = await resolveBrand(caller.workspace.id, brandSlug);
  const c = await commentRow(caller, brand, id);
  if (!mine(caller, c) && !can(caller, "brand.edit")) {
    throw new AssetError("forbidden", `Only its author can delete a comment, or someone with ${needs("brand.edit")}`);
  }
  const gone = await db.delete(brandComments).where(eq(brandComments.id, c.id)).returning({ id: brandComments.id });
  if (!gone.length) throw new AssetError("not_found", `No comment ${id} in ${brand.slug}`);
  return true;
}
