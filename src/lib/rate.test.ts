import assert from "node:assert/strict";
import { test } from "node:test";
import { limiter } from "./rate.ts";

test("lets max hits through per window, then says how long to wait, per key", () => {
  const l = limiter(2, 60_000);
  assert.equal(l.hit("a", 0), 0);
  assert.equal(l.hit("a", 1_000), 0);
  assert.equal(l.hit("a", 2_000), 58);
  assert.equal(l.hit("b", 2_000), 0, "another key has its own window");
  assert.equal(l.hit("a", 60_000), 0, "a new window starts over");
});

test("wait refuses without counting", () => {
  const l = limiter(1, 1_000);
  assert.equal(l.wait("a", 0), 0);
  assert.equal(l.wait("a", 0), 0);
  l.hit("a", 0);
  assert.equal(l.wait("a", 0), 1);
});
