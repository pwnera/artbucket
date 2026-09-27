import assert from "node:assert/strict";
import { test } from "node:test";
import { canonical, parseView, viewQuery } from "./view.ts";

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
