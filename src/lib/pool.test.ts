import assert from "node:assert/strict";
import { test } from "node:test";
import { gate, pool } from "./pool.ts";

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

test("a gate holds its weight, in turn, and lets a heavy one through alone", async () => {
  const g = gate(10, 2);
  let used = 0;
  let peak = 0;
  const order: number[] = [];
  const job = (w: number) =>
    g.run(w, async () => {
      peak = Math.max(peak, (used += w));
      await new Promise((r) => setTimeout(r, 5));
      order.push(w);
      used -= w;
    });
  const all = [job(6), job(5), job(4), job(30)];
  assert.ok(g.full, "two waiting behind the first");
  await Promise.all(all);
  assert.ok(peak <= 30 && order.indexOf(30) === 3, `${peak} ${order}`);
  assert.equal(peak, 30); // alone
  assert.ok(!g.full);
  // A failing job gives its weight back.
  await assert.rejects(g.run(10, async () => assert.fail("boom")));
  assert.equal(await g.run(10, async () => 1), 1);
});
