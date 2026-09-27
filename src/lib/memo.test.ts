import { test } from "node:test";
import assert from "node:assert/strict";
import { memo } from "./memo.ts";

test("keeps a lookup per key until forgotten", async () => {
  let calls = 0;
  const get = memo(60_000, async (k) => `${k}:${++calls}`);
  assert.equal(await get("a"), "a:1");
  assert.equal(await get("a"), "a:1");
  assert.equal(await get("b"), "b:2");
  get.forget("a");
  assert.equal(await get("a"), "a:3");
  assert.equal(await get("b"), "b:2");
  get.forget();
  assert.equal(await get("b"), "b:4");
});

test("asks again once it is stale", async () => {
  let calls = 0;
  const get = memo(0, async () => ++calls);
  await get();
  await new Promise((r) => setTimeout(r, 2));
  assert.equal(await get(), 2);
});

test("never keeps a failure", async () => {
  let calls = 0;
  const get = memo(60_000, async () => {
    if (++calls === 1) throw new Error("down");
    return calls;
  });
  await assert.rejects(get(), /down/);
  assert.equal(await get(), 2);
});
