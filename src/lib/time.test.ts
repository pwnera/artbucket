import assert from "node:assert/strict";
import { test } from "node:test";
import { ago, day, short } from "./time.ts";

test("relative times read like a person says them", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  assert.equal(ago(new Date(now - 30_000), now), "just now");
  assert.equal(ago(new Date(now - 3 * 3_600_000), now), "3 hours ago");
  assert.equal(ago(new Date(now - 86_400_000), now), "yesterday");
  assert.equal(day(new Date(now), new Date(now)), "Today");
  // 23:30 UTC is already tomorrow morning in Tokyo: the zone decides the day.
  const late = "2026-09-27T23:30:00Z";
  const morning = new Date("2026-09-28T01:00:00Z");
  assert.equal(day(late, morning, "UTC"), "Yesterday");
  assert.equal(day(late, morning, "Asia/Tokyo"), "Today");
  assert.equal(short(now - 30_000, now), "now");
  assert.equal(short(now - 2 * 3_600_000, now), "2h");
  assert.equal(short(now - 9 * 86_400_000, now), "1w");
});
