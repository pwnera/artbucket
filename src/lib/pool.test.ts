import assert from "node:assert/strict";
import { test } from "node:test";
import { pool } from "./pool.ts";

test("runs everything, never more than the limit at once", async () => {
  let running = 0;
  let peak = 0;
  const seen: number[] = [];
  await pool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    peak = Math.max(peak, ++running);
    await new Promise((r) => setTimeout(r, 5 * (n % 3)));
    seen.push(n);
    running--;
  });
  assert.equal(peak, 3);
  assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5, 6, 7]);
});

test("an empty list finishes", async () => {
  await pool([], 3, async () => assert.fail("never called"));
});
