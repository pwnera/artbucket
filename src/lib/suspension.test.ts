import assert from "node:assert/strict";
import { test } from "node:test";
import { suspendable, unavailable } from "./suspension.ts";

test("what a path names that a suspension takes down", () => {
  assert.deepEqual(suspendable("/p/acme"), { portal: "acme" });
  assert.deepEqual(suspendable("/p/acme/logo"), { portal: "acme" });
  assert.deepEqual(suspendable("/api/v1/portal/acme/site"), { portal: "acme" });
  assert.deepEqual(suspendable("/s/Ab_c-1"), { share: "Ab_c-1" });
  assert.deepEqual(suspendable("/api/v1/shared/Ab_c-1/uploads"), { share: "Ab_c-1" });
  assert.deepEqual(suspendable("/hub/acme/brand/brand.json"), { org: "acme" });
  assert.deepEqual(suspendable("/api/v1/hub/acme/brand"), { org: "acme" });
  // BrandHub's own host: every page is a /hub one.
  assert.deepEqual(suspendable("/acme/brand", true), { org: "acme" });
  assert.deepEqual(suspendable("/api/v1/hub/acme/follow", true), { org: "acme" });
  for (const own of ["/hub", "/hub/score", "/hub/llms.txt", "/hub/index.json", "/hub/sitemap.xml", "/api/v1/hub/offers", "/api/v1/hub/reports/x"]) {
    assert.equal(suspendable(own), null, own);
  }
  assert.equal(suspendable("/", true), null);
  assert.equal(suspendable("/llms.txt", true), null);
  assert.equal(suspendable("/a/123", true), null, "files answer for themselves (app/a)");
  for (const other of ["/", "/library", "/a/1/w_800", "/c/1", "/api/v1/assets", "/api/v1/portals/1", "/p/", "/p/a%2Fb", "/s/a.b"]) {
    assert.equal(suspendable(other), null, other);
  }
});

test("the answer names nobody and is kept by no cache", async () => {
  const page = unavailable(false);
  assert.equal(page.status, 451);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.match(page.headers.get("content-type")!, /^text\/html/);
  assert.match(await page.text(), /This content is unavailable/);
  const api = unavailable(true);
  assert.equal(api.status, 451);
  assert.equal(api.headers.get("cache-control"), "no-store");
  assert.deepEqual(await api.json(), { error: { code: "suspended", message: "This content is unavailable" } });
});
