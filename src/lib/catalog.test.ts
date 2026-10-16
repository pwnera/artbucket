import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAddress, formatQuery, impactLine, openPath, parseAddress, parseQuery, queryFromParams, slugOf } from "./catalog.ts";

test("a query is free words plus filters, a comma for or; unknown filters stay words", () => {
  const q = parseQuery("logo dark type:asset,rule status:current uses:acme/corp/brand/acme color:red");
  assert.equal(q.words, "logo dark color:red");
  assert.deepEqual(q.types, ["asset", "rule"]);
  assert.deepEqual(q.statuses, ["current"]);
  assert.deepEqual(q.uses, ["acme/corp/brand/acme"]);
  assert.deepEqual(parseQuery("type:thing").types, []);
  assert.equal(formatQuery(q), "logo dark color:red type:asset,rule status:current uses:acme/corp/brand/acme");
});

test("REST params are the same query", () => {
  assert.deepEqual(queryFromParams(new URLSearchParams("q=logo&status=current&type=asset")), parseQuery("logo type:asset status:current"));
});

test("addresses: an object, a release, a part; anything else is none", () => {
  assert.deepEqual(parseAddress("acme/corporate/asset/logo-primary@4"), { org: "acme", project: "corporate", type: "asset", slug: "logo-primary", release: 4 });
  assert.deepEqual(parseAddress("acme/corporate/brand/acme/rule/logo.primary")?.part, { type: "rule", slug: "logo.primary", release: null });
  assert.deepEqual(parseAddress("acme/corporate/site/storybook/component/ui-button@3")?.part, { type: "component", slug: "ui-button", release: 3 });
  assert.equal(parseAddress("acme/corporate/thing/x"), null);
  assert.equal(parseAddress("acme/corporate/asset"), null);
  assert.equal(formatAddress({ org: "acme", project: "corporate", type: "rule", slug: "logo.primary", parent: { type: "brand", slug: "acme" } }), "acme/corporate/brand/acme/rule/logo.primary");
  assert.equal(
    formatAddress({ org: "acme", project: "corporate", type: "component", slug: "ui-button", release: 3, parent: { type: "site", slug: "storybook" } }),
    "acme/corporate/site/storybook/component/ui-button@3",
  );
  assert.equal(slugOf("Press kit 2026!"), "press-kit-2026");
});

test("the impact line", () => {
  assert.equal(impactLine("logo.svg", 6, 2), "Changing logo.svg reaches 6 things downstream, in 2 projects.");
  assert.equal(impactLine("logo.svg", 1, 1), "Changing logo.svg reaches 1 thing downstream, in 1 project.");
  assert.equal(impactLine("logo.svg", 0, 0), "Nothing depends on logo.svg: it can change freely.");
});

test("portal, the older name, still finds sites", () => {
  assert.deepEqual(parseQuery("type:portal press").types, ["site"]);
  assert.equal(parseAddress("acme/corporate/portal/press")?.type, "site");
});

test("a click goes where the app shows each type: a component to its page, a rule to its row", () => {
  const project = { id: "p1" };
  const base = { id: "c1", slug: "ui-button", project };
  assert.equal(openPath({ ...base, type: "component", parent: { id: "s1", slug: "storybook" } }), "/components/c1?project=p1");
  assert.equal(openPath({ ...base, type: "rule", slug: "logo.primary", parent: { id: "b1", slug: "acme" } }), "/brands/acme/rules?project=p1#rule-logo.primary");
  assert.equal(openPath({ ...base, type: "collection", parent: null }), "/?collection=c1&project=p1");
});

test("kind: is an asset's file kind, type: what an object is; an unknown kind stays a word", () => {
  const q = parseQuery("logo kind:image,video type:asset kind:sculpture");
  assert.deepEqual(q.kinds, ["image", "video"]);
  assert.deepEqual(q.types, ["asset"]);
  assert.equal(q.words, "logo kind:sculpture");
  assert.equal(formatQuery(q), "logo kind:sculpture type:asset kind:image,video");
  assert.deepEqual(queryFromParams(new URLSearchParams("q=logo&kind=font")).kinds, ["font"]);
});
