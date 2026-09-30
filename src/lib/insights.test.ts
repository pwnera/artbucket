import assert from "node:assert/strict";
import { test } from "node:test";
import { adoptionDays, connectionsOf, fillWeeks, onCurrent, referrerHost, releaseOfAssets, searchWords, taken, weekOf, type ClientRow } from "./insights.ts";

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

test("connections say what each agent asked for, busiest first", () => {
  const row = (client: string, kind: ClientRow["kind"], subject: string | null, verdict: string | null, count: number, reasons: string[] | null = null): ClientRow => ({
    client,
    kind,
    subject,
    verdict,
    reasons,
    count,
  });
  const [claude, n8n] = connectionsOf([
    row("n8n", "fetch", null, "current", 4),
    row("Claude", "tool", "search_assets", "ok", 5),
    row("Claude", "tool", "check_use", "ok", 2),
    row("Claude", "tool", "set_rules", "refused", 1),
    row("Claude", "tool", "search_assets", "error", 1),
    row("Claude", "check", "dark-background", "refused", 2, ["context", "expired"]),
    row("Claude", "lookup", "dark-background", null, 1),
    row("Claude", "lookup", "print", null, 1),
    row("Claude", "search", "logo", "found", 1),
  ]);
  assert.equal(claude.client, "Claude");
  assert.deepEqual(claude.tools, [
    { name: "search_assets", calls: 6, failed: 1 },
    { name: "check_use", calls: 2, failed: 0 },
    { name: "set_rules", calls: 1, failed: 1 },
  ]);
  assert.deepEqual(claude.contexts, [
    { context: "dark-background", count: 3 },
    { context: "print", count: 1 },
  ]);
  assert.deepEqual(claude.refusals, {
    total: 3,
    reasons: [
      { code: "context", count: 2 },
      { code: "expired", count: 2 },
      { code: "scope", count: 1 },
    ],
  });
  assert.equal(claude.searches, 1);
  assert.deepEqual(n8n, { client: "n8n", events: 4, tools: [], contexts: [], refusals: { total: 0, reasons: [] }, fetches: 4, searches: 0 });
});

test("release adoption: a file belongs to the newest release holding it; replaced in its stack, it is older", () => {
  const of = releaseOfAssets([
    { number: 5, assets: ["new-logo", "photo"] },
    { number: 4, assets: ["old-logo", "photo"] },
  ]);
  assert.deepEqual([...of], [["new-logo", 5], ["photo", 5], ["old-logo", 4]]);
  assert.equal(onCurrent(of, 5, { asset: "new-logo", verdict: "current" }), true);
  assert.equal(onCurrent(of, 5, { asset: "photo", verdict: "superseded" }), false);
  assert.equal(onCurrent(of, 5, { asset: "old-logo", verdict: "current" }), false);
  const days = adoptionDays(
    [
      { day: "2026-09-12", asset: "new-logo", verdict: "current", count: 3 },
      { day: "2026-09-12", asset: "old-logo", verdict: "current", count: 1 },
      { day: "2026-09-14", asset: "photo", verdict: "current", count: 2 },
      // Before the window: left out.
      { day: "2026-09-01", asset: "old-logo", verdict: "current", count: 9 },
    ],
    of,
    5,
    "2026-09-12",
    "2026-09-14",
  );
  assert.deepEqual(days, [
    { day: "2026-09-12", current: 3, older: 1 },
    { day: "2026-09-13", current: 0, older: 0 },
    { day: "2026-09-14", current: 2, older: 0 },
  ]);
});
