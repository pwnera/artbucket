import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { signUp } from "@/test/db";
import { db } from "@/lib/db";
import { BYTES_LOCK, deleteObject, exists, originalKey } from "@/lib/storage";
import { deleteAsset, findAsset, getAsset, ingestBytes, restoreAsset, searchAssets } from "@/lib/core/assets";
import { createCollection } from "@/lib/core/collections";
import { createPortal, viewPortal } from "@/lib/core/portals";

const ada = await signUp("Ada");
const grace = await signUp("Grace");

// A picture of its own each time: identical bytes would dedupe into one asset.
let made = 0;
const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: made++, g: 0, b: 0 } } }).png().toBuffer();
const upload = async (filename: string, extra: { collections?: string[]; private?: boolean } = {}) =>
  (await ingestBytes(ada.caller, { bytes: await png(), mime: "image/png", filename, ...extra })).asset;
const listed = async (caller = ada.caller) => (await searchAssets(caller, { limit: 50 })).data.map((a: { id: string }) => a.id);

test("an upload lands in the caller's project, usable, and in their search", async () => {
  const asset = await upload("logo.png");
  assert.equal(asset.projectId, ada.caller.project.id);
  assert.equal(asset.state, "active");
  assert.equal(asset.mime, "image/png");
  assert.equal((await getAsset(ada.caller, asset.id))?.id, asset.id);
  assert.ok((await listed()).includes(asset.id));
});

test("another organization neither finds it nor deletes it", async () => {
  const asset = await upload("secret.png");
  assert.equal(await getAsset(grace.caller, asset.id), null);
  assert.ok(!(await listed(grace.caller)).includes(asset.id));
  assert.equal(await deleteAsset(grace.caller, asset.id), false);
  assert.equal((await findAsset(asset.id))?.deletedAt, null);
});

test("deleting is soft: the asset leaves search, stays restorable, and comes back as it was", async () => {
  const asset = await upload("old.png");
  assert.equal(await deleteAsset(ada.caller, asset.id), true);
  const gone = await findAsset(asset.id);
  assert.ok(gone?.deletedAt);
  assert.equal(gone.state, "deleted");
  assert.ok(!(await listed()).includes(asset.id));
  // Deleting it again changes nothing.
  assert.equal(await deleteAsset(ada.caller, asset.id), true);
  const back = await restoreAsset(ada.caller, asset.id);
  assert.equal(back?.deletedAt, null);
  assert.equal(back?.state, "active");
  assert.ok((await listed()).includes(asset.id));
});

test("a public portal shows its collections' usable assets, and never a private one", async () => {
  const { id: collection } = await createCollection(ada.caller, { name: "Press" });
  const open = await upload("press.png", { collections: [collection] });
  const closed = await upload("embargoed.png", { collections: [collection], private: true });
  const deleted = await upload("withdrawn.png", { collections: [collection] });
  await deleteAsset(ada.caller, deleted.id);
  await createPortal(ada.caller, { name: "Press", slug: "press-kit", collections: [collection] });
  const view = await viewPortal("press-kit", {});
  assert.deepEqual(view.data.map((a: { id: string }) => a.id), [open.id]);
  assert.equal(view.total, 1);
  assert.deepEqual(view.portal.collections.map((c) => c.count), [1]);
  // Its owner still sees the private one in the library.
  assert.ok((await listed()).includes(closed.id));
});

test("an upload stores its bytes before its transaction, and puts them back if the sweep took them meanwhile", async () => {
  const bytes = await png();
  const sha = createHash("sha256").update(bytes).digest("hex");
  // The test bucket outlives the test's database: an earlier run's copy would be found already there.
  await deleteObject(originalKey(sha));
  // The sweep, between its last look and its delete: it holds the lock an upload of these bytes takes.
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  let locked = () => {};
  const isLocked = new Promise<void>((r) => (locked = r));
  const sweep = db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${BYTES_LOCK}, hashtext(${sha}))`);
    locked();
    await held;
  });
  try {
    await isLocked;
    const upload = ingestBytes(ada.caller, { bytes, mime: "image/png", filename: "raced.png" });
    // The original lands while the lock is still taken: the PUT is outside the transaction.
    for (let i = 0; !(await exists(originalKey(sha))); i++) {
      if (i > 100) assert.fail("the original waited for the lock before it was stored");
      await sleep(50);
    }
    await deleteObject(originalKey(sha));
    release();
    await sweep;
    const { asset } = await upload;
    assert.equal(asset.sha256, sha);
    assert.ok(await exists(originalKey(sha)), "the original is back under the lock");
  } finally {
    release();
    await sweep;
  }
});
