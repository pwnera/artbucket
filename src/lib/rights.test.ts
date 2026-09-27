import assert from "node:assert/strict";
import { test } from "node:test";
import { isEmpty, rightsReasons, RightsInput, type Rights } from "./rights.ts";

const rights = (r: Partial<Rights>): Rights => RightsInput.parse(r);
const codes = (r: Rights | null, use: Parameters<typeof rightsReasons>[1]) =>
  rightsReasons(r, use).map((x) => `${x.blocking ? "block" : "warn"}:${x.code}`);

test("input is normalized: codes uppercased, channels as slugs, empty is empty", () => {
  const r = rights({ territories: [" de", "FR", "de"], channels: ["Paid-Social"] });
  assert.deepEqual(r.territories, ["DE", "FR"]);
  assert.deepEqual(r.channels, ["paid-social"]);
  assert.ok(isEmpty(rights({})));
  assert.ok(!RightsInput.safeParse({ territories: ["Germany"] }).success);
  assert.ok(!RightsInput.safeParse({ embargo: "2027-01-02", expires: "2027-01-01" }).success);
});

test("no rights, no restrictions", () => {
  assert.deepEqual(codes(null, {}), []);
});

test("the license window: embargo before, expiry after, the last day still counts", () => {
  const r = rights({ embargo: "2026-10-01", expires: "2026-12-31" });
  assert.deepEqual(codes(r, { date: "2026-09-30" }), ["block:embargoed"]);
  assert.deepEqual(codes(r, { date: "2026-10-01" }), []);
  assert.deepEqual(codes(r, { date: "2026-12-31" }), []);
  assert.deepEqual(codes(r, { date: "2027-01-01" }), ["block:expired"]);
});

test("territory and channel refuse a use outside them, and ask when the use doesn't say", () => {
  const r = rights({ territories: ["DE", "AT"], channels: ["web", "print"] });
  assert.deepEqual(codes(r, { territory: "DE", channel: "web" }), []);
  assert.deepEqual(codes(r, { territory: "US", channel: "paid-social" }), ["block:territory", "block:channel"]);
  assert.deepEqual(codes(r, {}), ["warn:territory", "warn:channel"]);
});

test("a missing model release is editorial only", () => {
  const r = rights({ modelRelease: "missing" });
  assert.deepEqual(codes(r, { channel: "editorial" }), []);
  assert.deepEqual(codes(r, { channel: "paid-social" }), ["block:model_release"]);
  assert.deepEqual(codes(r, {}), ["warn:model_release"]);
  assert.deepEqual(codes(rights({ modelRelease: "released" }), { channel: "paid-social" }), []);
});
