import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTION_PATTERN, bodyIn, summaryOf, takes } from "./automations.ts";

test("a governance filter takes exact names and prefixes, and everything when empty", () => {
  assert.equal(takes([], "grant.set"), true);
  assert.equal(takes(["share.*"], "share.created"), true);
  assert.equal(takes(["share.*"], "shares.created"), false);
  assert.equal(takes(["grant.set", "key.*"], "key.created"), true);
  assert.equal(takes(["grant.set"], "grant.removed"), false);
  assert.ok(ACTION_PATTERN.test("asset.accepted_tags") && ACTION_PATTERN.test("sso.*"));
  assert.ok(!ACTION_PATTERN.test("*") && !ACTION_PATTERN.test("Share.created") && !ACTION_PATTERN.test("share"));
});

test("each event is summed up in a line, a test marked so", () => {
  assert.equal(summaryOf({ event: "brand.released", brand: { name: "Acme" }, release: 3 }), "Acme release 3 is out");
  assert.equal(summaryOf({ event: "governance", actor: "Ada", action: "share.created", target: "Press kit" }), "Ada: share.created Press kit");
  assert.equal(summaryOf({ event: "check.refused", asset: { filename: "logo.svg", title: null }, refusals: 1, days: 7 }), "logo.svg was refused 1 time in 7 days");
  assert.equal(summaryOf({ event: "fix.opened", kind: "gap", q: "dark logo", searches: 4 }), 'Searched 4 times, found nothing: "dark logo"');
  assert.equal(summaryOf({ event: "fix.opened", kind: "stale", place: "partner.example.com", asset: { title: "Logo" } }), "partner.example.com still loads Logo, a replaced version");
  assert.equal(summaryOf({ event: "review.waiting", asset: { filename: "a.png" }, days: 3, test: true }), "Test: a.png has waited 3 days for review");
});

test("Slack gets text with a link, Teams an Adaptive Card, JSON the run as it is", () => {
  const p = { event: "brand.released", brand: { name: "Acme" }, release: 3, url: "https://app.example.com/brands/acme", automation: { name: "Tell #brand" } };
  assert.equal(bodyIn("json", p), p);
  assert.deepEqual(bodyIn("slack", p), { text: "Acme release 3 is out <https://app.example.com/brands/acme|Open>\n_Tell #brand_" });
  const card = (bodyIn("teams", p).attachments as { content: { body: { text: string }[]; actions?: unknown } }[])[0].content;
  assert.equal(card.body[0].text, "Acme release 3 is out [Open](https://app.example.com/brands/acme)");
  assert.equal(card.actions, undefined);
});
