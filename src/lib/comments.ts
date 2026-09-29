/**
 * Review comments on a brand's pages, as threads (lib/core/brand-comments.ts
 * stores them, components/builder/comments.tsx shows them): a root pinned to
 * a page, or to one section on it, and the replies under it. Only a root is
 * resolved, and resolving it settles the whole thread.
 *
 * Pure, so `pnpm test` runs it under plain Node, and the server and the
 * builder thread and count the same way.
 */

/** The longest a comment may be, in characters. */
export const MAX_COMMENT = 4000;

type When = string | Date;

/** What threading reads of a comment: the server's rows and the API's JSON both are one. */
export type Threadable = { id: string; parent: string | null; resolvedAt: When | null; createdAt: When };

export type Thread<T extends Threadable> = T & { replies: T[] };

const time = (at: When) => new Date(at).getTime();

/** When a thread last moved: its newest reply, or itself. */
const activity = <T extends Threadable>(t: Thread<T>) => Math.max(time(t.createdAt), ...t.replies.map((r) => time(r.createdAt)));

/**
 * Comments as threads, the way a review reads them: open ones first, the one
 * that moved last on top; then resolved ones, the last settled first. Replies
 * run oldest first under their root. A reply whose root isn't among `rows`
 * is left out: its thread was deleted, or filtered away.
 */
export function threads<T extends Threadable>(rows: T[]): Thread<T>[] {
  const roots = new Map<string, Thread<T>>();
  for (const r of rows) if (!r.parent) roots.set(r.id, { ...r, replies: [] });
  for (const r of rows) if (r.parent) roots.get(r.parent)?.replies.push(r);
  const out = [...roots.values()];
  for (const t of out) t.replies.sort((a, b) => time(a.createdAt) - time(b.createdAt) || a.id.localeCompare(b.id));
  return out.sort((a, b) => {
    if (!a.resolvedAt !== !b.resolvedAt) return a.resolvedAt ? 1 : -1;
    const by = a.resolvedAt && b.resolvedAt ? time(b.resolvedAt) - time(a.resolvedAt) : activity(b) - activity(a);
    return by || a.id.localeCompare(b.id);
  });
}

/**
 * A section as counts know it: its page and its id. Ids are only unique
 * within a page (an agent may call a section "intro" on every one), so a
 * count keyed by the id alone would spill onto other pages. Page slugs never
 * hold a "/".
 */
export const sectionKey = (page: string, section: string) => `${page}/${section}`;

/**
 * Open threads, counted: in all, per page, and per section (by sectionKey).
 * A thread on the page as a whole counts toward its page and no section.
 */
export function openCounts(all: { page: string; section: string | null; parent: string | null; resolvedAt: When | null }[]) {
  const byPage = new Map<string, number>();
  const bySection = new Map<string, number>();
  let open = 0;
  for (const t of all) {
    if (t.parent || t.resolvedAt) continue;
    open++;
    byPage.set(t.page, (byPage.get(t.page) ?? 0) + 1);
    if (t.section) {
      const k = sectionKey(t.page, t.section);
      bySection.set(k, (bySection.get(k) ?? 0) + 1);
    }
  }
  return { open, byPage, bySection };
}

/**
 * Where a page stored under `slug` is now, from the brand's pages and the
 * slugs each had before a rename: its own slug, the page that took it as an
 * old name, or the slug as it was when no page has it (the page was deleted).
 */
export function pageNow(pages: { slug: string; aliases: string[] }[]): (slug: string) => string {
  const now = new Map<string, string>();
  for (const p of pages) for (const a of p.aliases) now.set(a, p.slug);
  // A slug a page has now wins over the same slug as someone's old name.
  for (const p of pages) now.set(p.slug, p.slug);
  return (slug) => now.get(slug) ?? slug;
}
