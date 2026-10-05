import assert from "node:assert/strict";
import { test } from "node:test";
import { approvesOwn, deliverable, expiring, isReview, maxAge, retired, stateOf } from "./lifecycle.ts";

const rights = (r: { expires?: string; embargo?: string }) => ({ expires: r.expires ?? null, embargo: r.embargo ?? null });

test("expired is approved past its last day, never a stored status", () => {
  const a = { status: "active" as const, rights: rights({ expires: "2026-03-31" }) };
  assert.equal(stateOf(a, "2026-03-31"), "active");
  assert.equal(stateOf(a, "2026-04-01"), "expired");
  assert.equal(stateOf({ ...a, status: "archived" }, "2026-04-01"), "archived");
  assert.equal(stateOf({ status: "draft", rights: null }), "draft");
});

test("only approved, unexpired, unembargoed assets are served to anyone", () => {
  assert.equal(deliverable({ status: "active", rights: null }), true);
  for (const status of ["draft", "proposed", "archived", "rejected"] as const) assert.equal(deliverable({ status, rights: null }), false);
  assert.equal(deliverable({ status: "active", rights: rights({ embargo: "2026-05-01" }) }, "2026-04-30"), false);
  assert.equal(deliverable({ status: "active", rights: rights({ embargo: "2026-05-01" }) }, "2026-05-01"), true);
  assert.equal(deliverable({ status: "active", rights: rights({ expires: "2026-05-01" }) }, "2026-05-02"), false);
  assert.equal(retired({ status: "active", rights: rights({ expires: "2026-05-01" }) }, "2026-05-02"), true);
  assert.equal(retired({ status: "proposed", rights: null }), false);
});

test("deleted wins over any status, and is gone for the public until restored", () => {
  const deleted = { status: "active" as const, rights: null, deletedAt: new Date() };
  assert.equal(stateOf(deleted), "deleted");
  assert.equal(deliverable(deleted), false);
  assert.equal(retired(deleted), true);
  assert.equal(deliverable({ ...deleted, deletedAt: null }), true);
});

test("caches never keep bytes past the end of the last day of use", () => {
  assert.equal(maxAge({ rights: null }), 3600);
  assert.equal(maxAge({ rights: rights({ expires: "2026-05-01" }) }, new Date("2026-04-20T00:00:00Z")), 3600);
  assert.equal(maxAge({ rights: rights({ expires: "2026-05-01" }) }, new Date("2026-05-01T23:50:00Z")), 600);
  assert.equal(maxAge({ rights: rights({ expires: "2026-05-01" }) }, new Date("2026-05-03T00:00:00Z")), 0);
});

test("changing what the library holds is a review decision; reworking a draft is an edit", () => {
  assert.equal(isReview("draft", "proposed"), false);
  assert.equal(isReview("proposed", "draft"), false);
  assert.equal(isReview("rejected", "draft"), false);
  assert.equal(isReview("proposed", "active"), true);
  assert.equal(isReview("proposed", "rejected"), true);
  assert.equal(isReview("active", "archived"), true);
  assert.equal(isReview("active", "draft"), true);
  assert.equal(isReview("archived", "proposed"), true);
});

test("an approved asset says when its last day is close", () => {
  const a = { status: "active" as const, rights: rights({ expires: "2026-10-05" }) };
  assert.equal(expiring(a, "2026-09-30"), "Expires in 5 days");
  assert.equal(expiring(a, "2026-10-04"), "Expires tomorrow");
  assert.equal(expiring(a, "2026-10-05"), "Expires today");
  assert.equal(expiring(a, "2026-10-06"), null, "past it, it is expired, not expiring");
  assert.equal(expiring(a, "2026-08-01"), null, "far off");
  assert.equal(expiring({ ...a, status: "draft" }, "2026-09-30"), null);
  assert.equal(expiring({ status: "active", rights: null }), null);
});

test("whoever proposed an asset can't approve it, and anyone else with approve can", () => {
  const a = { status: "proposed" as const, proposedBy: "Claude" };
  assert.ok(approvesOwn(a, "active", "Claude"));
  assert.ok(approvesOwn({ ...a, status: "rejected" }, "active", "Claude"));
  assert.ok(!approvesOwn(a, "rejected", "Claude"), "turning your own proposal down is withdrawing it");
  assert.ok(!approvesOwn(a, "active", "Ada"));
  assert.ok(!approvesOwn({ status: "draft", proposedBy: null }, "active", "Ada"));
});
