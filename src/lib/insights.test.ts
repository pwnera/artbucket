import assert from "node:assert/strict";
import { test } from "node:test";
import { fillWeeks, referrerHost, searchWords, weekOf } from "./insights.ts";

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
