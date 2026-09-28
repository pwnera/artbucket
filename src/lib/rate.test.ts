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

test("a flood of new keys forgets old windows once a window, not on every key", () => {
  const l = limiter(1, 1000);
  for (let i = 0; i < 10_001; i++) l.hit(`a${i}`, 0);
  const t = performance.now();
  // A window later: the first new key sweeps, the next 40,000 don't scan.
  for (let i = 0; i < 40_000; i++) l.hit(`b${i}`, 1000);
  assert.ok(performance.now() - t < 400, "no scan per key");
  assert.equal(l.hit("b0", 1500), 1, "still counted");
  assert.equal(l.hit("a0", 1500), 0, "an old window is forgotten");
});
