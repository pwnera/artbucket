import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { OWNERS_PREFIX, ownerKey, strangers } from "@/lib/bucket-owners";
import { db } from "@/lib/db";
import { assets, grants, instance, invitations, renditions } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { rollUp } from "@/lib/core/events";
import { reprove } from "@/lib/core/reproof";
import { BYTES_LOCK, deleteObject, ensureBucket, listObjects, originalKey, putObject, RENDITION_DAYS } from "@/lib/storage";

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
 * an upload of the same bytes holds (lib/core/assets.ts finalizeUpload). Not
 * from two databases on one bucket: each would remove the other's files, so
 * neither sweeps while the bucket is marked by another (lib/bucket-owners.ts).
 */

export const PURGE_DAYS = 30;
/** Nothing written in the last day is touched: an upload may be between storage and its row. */
const GRACE_MS = 24 * 60 * 60 * 1000;

/** This database's id, made the first time it is asked for. */
async function instanceId() {
  await db.insert(instance).values({}).onConflictDoNothing();
  const [row] = await db.select({ id: instance.id }).from(instance);
  return row.id;
}

/**
 * Marks the bucket as swept by this database, then names every other that has.
 * ponytail: two databases marking one bucket in the same moment may each list
 * before the other's mark lands, and both sweep once. Only files older than
 * the grace day go, which a database just pointed at the bucket has none of.
 */
async function otherOwners() {
  const self = await instanceId();
  await putObject(ownerKey(self), Buffer.from(env.APP_URL), "text/plain");
  const keys: string[] = [];
  for await (const o of listObjects(OWNERS_PREFIX)) keys.push(o.key);
  return strangers(keys, self);
}

/** Rows deleted more than PURGE_DAYS ago, gone for good with their grants. */
async function purge() {
  // Together: grants and invitations never outlive their asset.
  return db.transaction(async (tx) => {
    const gone = await tx
      .delete(assets)
      .where(and(isNotNull(assets.deletedAt), lt(assets.deletedAt, sql`now() - make_interval(days => ${PURGE_DAYS})`)))
      .returning({ id: assets.id });
    const ids = gone.map((g) => g.id);
    if (ids.length) {
      await tx.delete(grants).where(and(eq(grants.resource, "asset"), inArray(grants.resourceId, ids)));
      await tx.delete(invitations).where(and(eq(invitations.resource, "asset"), inArray(invitations.resourceId, ids)));
    }
    return ids.length;
  });
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
  // Renditions the bucket has expired by now no longer count toward storage (lib/core/usage.ts).
  await db.delete(renditions).where(lt(renditions.createdAt, sql`now() - make_interval(days => ${RENDITION_DAYS})`));
  const others = await otherOwners();
  if (others.length) {
    console.warn(
      `[artbucket] Sweep skipped: bucket ${env.S3_BUCKET} is also swept by another database (${others.map(ownerKey).join(", ")}). ` +
        "Give each database its own bucket, or delete the marker of one that is gone.",
    );
    return { purged: 0, removed: 0 };
  }
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

/** At boot, then every six hours, with Insights' daily rollup and the domains' re-check; a failed run is logged and tried again next time. */
export function scheduleSweep() {
  const run = () => {
    rollUp().catch((err) => console.warn("[artbucket] Insights rollup stopped:", err instanceof Error ? err.message : err));
    reprove()
      .then((n) => n && console.info(`[artbucket] Unverified ${n} domains whose TXT record is gone`))
      .catch((err) => console.warn("[artbucket] Domain re-check stopped:", err instanceof Error ? err.message : err));
    return sweep()
      .then(({ purged, removed }) => {
        if (purged || removed) console.info(`[artbucket] Swept: ${purged} deleted assets purged, ${removed} files removed`);
      })
      .catch((err) => console.warn("[artbucket] Sweep stopped:", err instanceof Error ? err.message : err));
  };
  void run();
  setInterval(run, EVERY_MS).unref();
}
