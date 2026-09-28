import assert from "node:assert/strict";
import { test } from "node:test";
import { snapshot, track } from "./saving.ts";

test("track counts writes in flight, and a null or a throw as Not saved until one lands", async () => {
  let finish!: (v: unknown) => void;
  const p = track(new Promise((r) => (finish = r)));
  assert.equal(snapshot().inFlight, 1);
  finish(null);
  assert.equal(await p, null);
  const first = snapshot().failedAt;
  assert.ok(first);
  assert.deepEqual({ ...snapshot(), failedAt: 0 }, { inFlight: 0, failedAt: 0, savedAt: null });

  await new Promise((r) => setTimeout(r, 2));
  await assert.rejects(track(Promise.reject(new Error("offline"))));
  // A newer failure is a newer stamp, so SaveStatus can tell it from one before it mounted.
  assert.ok(snapshot().failedAt! > first);

  await track(Promise.resolve({}));
  assert.equal(snapshot().failedAt, null);
  assert.equal(snapshot().inFlight, 0);
  assert.ok(snapshot().savedAt);
});
