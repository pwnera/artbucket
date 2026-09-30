import assert from "node:assert/strict";
import { test } from "node:test";
import { fillWeeks, referrerHost, searchWords, taken, weekOf } from "./insights.ts";

test("only the referrer's host is kept, never its path, query or port", () => {
  assert.equal(referrerHost("https://Docs.Example.com:8443/brand/logo?token=secret#x"), "docs.example.com");
  assert.equal(referrerHost("http://localhost:3000/"), "localhost");
  assert.equal(referrerHost(null), null);
  assert.equal(referrerHost(""), null);
  assert.equal(referrerHost("not a url"), null);
  assert.equal(referrerHost("android-app://com.example/"), null);
  assert.equal(referrerHost("file:///Users/me/page.html"), null);
});

test("searches count by their words, however they were typed", () => {
  assert.equal(searchWords("  Hero   Image "), "hero image");
  assert.equal(searchWords(null), "");
  assert.equal(searchWords("x".repeat(300)).length, 200);
});

test("weeks start on Monday, in UTC, as Postgres truncates them", () => {
  assert.equal(weekOf(new Date("2026-09-30T12:00:00Z")), "2026-09-28");
  assert.equal(weekOf(new Date("2026-09-28T00:00:00Z")), "2026-09-28");
  assert.equal(weekOf(new Date("2026-10-04T23:59:59Z")), "2026-09-28");
  assert.equal(weekOf(new Date("2026-01-01T08:00:00Z")), "2025-12-29");
});

test("a weekly chart has every week, the quiet ones at zero", () => {
  const weeks = fillWeeks([{ week: "2026-09-14", n: 3 }, { week: "2026-01-05", n: 9 }], { n: 0 }, 3, new Date("2026-09-30T00:00:00Z"));
  assert.deepEqual(weeks, [
    { week: "2026-09-14", n: 3 },
    { week: "2026-09-21", n: 0 },
    { week: "2026-09-28", n: 0 },
  ]);
});

test("an offer is taken when the same client uses the replacement afterwards", () => {
  const refusal = { at: new Date("2026-09-30T10:00:00Z"), client: "Claude" };
  const use = (asset: string, client: string | null, at: string) => ({ asset, client, at: new Date(at) });
  assert.equal(taken(refusal, "new", [use("new", "Claude", "2026-09-30T10:01:00Z")]), true);
  assert.equal(taken(refusal, "new", [use("new", "Claude", "2026-09-30T09:59:00Z")]), false, "before the refusal");
  assert.equal(taken(refusal, "new", [use("new", "Cursor", "2026-09-30T10:01:00Z")]), false, "another agent");
  assert.equal(taken(refusal, "new", [use("old", "Claude", "2026-09-30T10:01:00Z")]), false, "the refused one again");
  assert.equal(taken({ ...refusal, client: null }, "new", [use("new", null, "2026-09-30T11:00:00Z")]), true);
});
