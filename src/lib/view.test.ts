import assert from "node:assert/strict";
import { test } from "node:test";
import { canonical, explored, narrowOf, parseView, statesOf, viewQuery } from "./view.ts";

test("a view round-trips through its URL, in canonical order", () => {
  const v = parseView(new URLSearchParams("f.budget.gte=10&asset=a1&type=font&tag=x&q=fox&f.channel=web&collection=c1&type=image"));
  assert.deepEqual(v.filters, { channel: ["web"] });
  assert.deepEqual(v.extra, [["f.budget.gte", "10"]]);
  assert.equal(viewQuery(v), "q=fox&tag=x&type=font&type=image&collection=c1&f.channel=web&f.budget.gte=10&asset=a1");
  assert.equal(viewQuery(v, false), "q=fox&tag=x&type=font&type=image&collection=c1&f.channel=web&f.budget.gte=10");
});

test("/?review opens the queue; a saved search matches however it was written", () => {
  assert.equal(parseView(new URLSearchParams("review")).review, true);
  assert.equal(parseView(new URLSearchParams("review=false")).review, false);
  assert.equal(canonical("f.channel=web&q=fox"), "q=fox&f.channel=web");
});

test("a status filter narrows the view and keeps its place in the query", () => {
  const v = parseView(new URLSearchParams("status=archived&q=logo&status=expired"));
  assert.deepEqual(v.status, ["archived", "expired"]);
  assert.equal(viewQuery(v), "q=logo&status=archived&status=expired");
});

test("Explore's facets narrow every type: tags as they are, states as the catalog's statuses", () => {
  const v = (q: string) => narrowOf(parseView(new URLSearchParams(q)));
  assert.deepEqual(v("q=logo"), { tags: [], statuses: [] });
  assert.deepEqual(v("tag=brand&status=active&status=proposed"), { tags: ["brand"], statuses: ["current", "in_review"] });
  assert.deepEqual(v("status=archived&status=rejected"), { tags: [], statuses: ["archived"] });
  // What only assets have leaves the other types out.
  for (const q of ["type=image", "f.channel=web", "status=expired", "f.budget.gte=10"]) assert.equal(v(q), null, q);
});

test("Explore's search box is explored: its search of every type is the one Insights records", () => {
  const e = (q: string, browse = false) => explored(parseView(new URLSearchParams(q)), browse);
  assert.equal(e("q=logo"), true);
  assert.equal(e("q=logo", true), false);
  assert.equal(e("q=logo&collection=c1"), false);
  assert.equal(e("q=logo&type=image"), false);
  assert.equal(e("tag=brand"), false);
});

test("the catalog's statuses go back into the URL as asset states, and come out the same", () => {
  assert.deepEqual(statesOf(["current", "in_review", "archived", "replaced"]), ["active", "proposed", "archived"]);
  const back = narrowOf(parseView(new URLSearchParams(statesOf(["current", "draft"]).map((s) => `status=${s}`).join("&"))));
  assert.deepEqual(back?.statuses, ["current", "draft"]);
});

test("Explore's type tab is part of the view, so a saved search opens on it", () => {
  const v = parseView(new URLSearchParams("q=button&in=component&tag=forms"));
  assert.equal(v.in, "component");
  assert.equal(canonical("tag=forms&in=component&q=button"), "q=button&tag=forms&in=component");
});
