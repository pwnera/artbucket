import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, grants, invitations } from "@/lib/db/schema";
import { BYTES_LOCK, deleteObject, ensureBucket, listObjects, originalKey } from "@/lib/storage";

/**
 * The one path bytes leave by. A deleted asset stays restorable for
 * PURGE_DAYS, then its row goes; an original goes when no row, deleted or
 * not, in any workspace, holds it: after a purge, a workspace or an
 * organization deleted, or an upload that died between storage and the
 * database. Stills for previews go the same way. Staging and renditions
 * expire by the bucket's lifecycle rules (lib/storage.ts).
 *
 * Runs at boot and every few hours (instrumentation.ts). Safe to run twice
 * at once, from two instances: each removal is checked again under the lock
 * an upload of the same bytes holds (lib/core/assets.ts finalizeUpload).
 */

export const PURGE_DAYS = 30;
/** Nothing written in the last day is touched: an upload may be between storage and its row. */
const GRACE_MS = 24 * 60 * 60 * 1000;

/** Rows deleted more than PURGE_DAYS ago, gone for good with their grants. */
async function purge() {
  const gone = await db
    .delete(assets)
    .where(and(isNotNull(assets.deletedAt), lt(assets.deletedAt, sql`now() - make_interval(days => ${PURGE_DAYS})`)))
    .returning({ id: assets.id });
  const ids = gone.map((g) => g.id);
  if (ids.length) {
    await db.delete(grants).where(and(eq(grants.resource, "asset"), inArray(grants.resourceId, ids)));
    await db.delete(invitations).where(and(eq(invitations.resource, "asset"), inArray(invitations.resourceId, ids)));
  }
  return ids.length;
}

/** What is still held: every row's hash, and every still a row points at. */
async function held() {
  const rows = await db
    .selectDistinct({ sha256: assets.sha256, preview: sql<string | null>`${assets.probe} ->> 'preview'` })
    .from(assets);
  return {
    originals: new Set(rows.map((r) => r.sha256)),
    previews: new Set(rows.flatMap((r) => (r.preview ? [r.preview] : []))),
  };
}

/** An original nothing holds, removed under the lock an upload of it takes, after one last look. */
async function dropOriginal(sha256: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${BYTES_LOCK}, hashtext(${sha256}))`);
    const [still] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.sha256, sha256)).limit(1);
    if (still) return false;
    await deleteObject(originalKey(sha256));
    return true;
  });
}

/**
 * ponytail: lists the whole bucket prefix and holds every hash in memory:
 * fine to a few hundred thousand assets. Past that, keep a table of bytes
 * with a reference count and sweep from it instead.
 */
export async function sweep() {
  await ensureBucket();
  const purged = await purge();
  const { originals, previews } = await held();
  const old = Date.now() - GRACE_MS;
  let removed = 0;
  for await (const o of listObjects("assets/")) {
    const sha = o.key.slice("assets/".length);
    if (!sha || originals.has(sha) || o.modified.getTime() > old) continue;
    if (await dropOriginal(sha)) removed++;
  }
  // ponytail: a still is re-put by an upload without a lock; the grace day covers any upload that takes less.
  for await (const o of listObjects("previews/")) {
    const sha = o.key.slice("previews/".length);
    if (!sha || previews.has(sha) || o.modified.getTime() > old) continue;
    await deleteObject(o.key);
    removed++;
  }
  return { purged, removed };
}

const EVERY_MS = 6 * 60 * 60 * 1000;

/** At boot, then every six hours; a failed run is logged and tried again next time. */
export function scheduleSweep() {
  const run = () =>
    sweep()
      .then(({ purged, removed }) => {
        if (purged || removed) console.info(`[artbucket] Swept: ${purged} deleted assets purged, ${removed} files removed`);
      })
      .catch((err) => console.warn("[artbucket] Sweep stopped:", err instanceof Error ? err.message : err));
  void run();
  setInterval(run, EVERY_MS).unref();
}
