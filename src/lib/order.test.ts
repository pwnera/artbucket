import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOrder, moveTo } from "./order.ts";

test("a saved order wins, new items follow, gone ones are ignored", () => {
  const items = ["a", "b", "c", "d"];
  assert.deepEqual(applyOrder(items, ["c", "x", "a"], (s) => s), ["c", "a", "b", "d"]);
});

test("moving puts an item before or after another", () => {
  assert.deepEqual(moveTo(["a", "b", "c"], "a", "c", true), ["b", "c", "a"]);
  assert.deepEqual(moveTo(["a", "b", "c"], "c", "a", false), ["c", "a", "b"]);
  assert.deepEqual(moveTo(["a", "b"], "a", "a", true), ["a", "b"]);
});
