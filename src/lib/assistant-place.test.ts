import assert from "node:assert/strict";
import { test } from "node:test";
import { assistantPlace } from "./assistant-place.ts";

const O = "https://app.example.com";
const A = "6700995f-e0d8-4e6b-a64f-7abbf7ec1752";

test("the assistant may take the person to the library's views, an asset, a brand and the app's pages", () => {
  assert.equal(assistantPlace("/", O), "/");
  assert.equal(assistantPlace("/?q=summer&tag=people&type=image&f.channel=web", O), "/?q=summer&tag=people&type=image&f.channel=web");
  assert.equal(assistantPlace(`/?asset=${A}`, O), `/?asset=${A}`);
  assert.equal(assistantPlace("/review", O), "/review");
  assert.equal(assistantPlace("/review?type=video&status=proposed", O), "/review?type=video&status=proposed");
  assert.equal(assistantPlace("/brands/northwind-coffee", O), "/brands/northwind-coffee");
  assert.equal(assistantPlace("/brands/northwind-coffee/rules", O), "/brands/northwind-coffee/rules");
  assert.equal(assistantPlace("/brands/northwind-coffee/guidelines?page=colors", O), "/brands/northwind-coffee/guidelines?page=colors");
  for (const p of ["/collections", "/sites", "/connections", "/insights", "/insights/activity", "/insights/checks", "/activity", "/settings", "/settings/organization/usage", "/settings/account/profile"]) {
    assert.equal(assistantPlace(p, O), p);
  }
});

test("the catalog: an object on one of its tabs, by id or address, or a project's folder", () => {
  assert.equal(assistantPlace(`/catalog?o=${A}&tab=lineage`, O), `/catalog?o=${A}&tab=lineage`);
  const address = encodeURIComponent("acme/corporate/brand/acme");
  assert.equal(assistantPlace(`/catalog?o=${address}&tab=access`, O), `/catalog?o=${address}&tab=access`);
  assert.equal(assistantPlace(`/catalog?f=${A}`, O), `/catalog?f=${A}`);
  assert.equal(assistantPlace(`/catalog?o=${A}&tab=delete`, O), `/catalog?o=${A}`);
});

test("editors and empty forms: nothing is saved until the person acts", () => {
  assert.equal(assistantPlace("/brands/acme/guidelines/edit?page=logo", O), "/brands/acme/guidelines/edit?page=logo");
  assert.equal(assistantPlace(`/sites?edit=${A}`, O), `/sites?edit=${A}`);
  assert.equal(assistantPlace(`/sites?open=${A}`, O), `/sites?open=${A}`);
  assert.equal(assistantPlace("/sites?new=portal", O), "/sites?new=portal");
  assert.equal(assistantPlace("/brands?new=brand", O), "/brands?new=brand");
  assert.equal(assistantPlace("/team?tab=audit", O), "/team?tab=audit");
  assert.equal(assistantPlace("/team?invite=1", O), "/team?invite=1");
});

test("nowhere else: other origins, other pages, query a place doesn't read", () => {
  for (const p of ["https://evil.example/", "//evil.example/", "/\\evil.example", "/api/v1/keys", "/s/token", "/hub", "/hub/acme/acme", "/p/press", "/design", "/login", "brands", null, 3]) {
    assert.equal(assistantPlace(p, O), null, String(p));
  }
  assert.equal(assistantPlace("/brands/x/guidelines?page=a&git=1&panel=git", O), "/brands/x/guidelines?page=a");
  assert.equal(assistantPlace("/review?anything=1", O), "/review");
  assert.equal(assistantPlace("/?q=a&fields=1", O), "/?q=a");
  assert.equal(assistantPlace("/sites?edit=not-an-id&new=../x", O), "/sites");
  assert.equal(assistantPlace("/team?tab=keys", O), "/team");
});
