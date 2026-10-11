import assert from "node:assert/strict";
import { test } from "node:test";
import { assistantPlace } from "./assistant-place.ts";

const O = "https://app.example.com";

test("the assistant may take the person to the library's views, an asset, a brand and the app's pages", () => {
  assert.equal(assistantPlace("/", O), "/");
  assert.equal(assistantPlace("/?q=summer&tag=people&type=image&f.channel=web", O), "/?q=summer&tag=people&type=image&f.channel=web");
  assert.equal(assistantPlace("/?asset=6700995f-e0d8-4e6b-a64f-7abbf7ec1752", O), "/?asset=6700995f-e0d8-4e6b-a64f-7abbf7ec1752");
  assert.equal(assistantPlace("/review", O), "/review");
  assert.equal(assistantPlace("/brands/northwind-coffee", O), "/brands/northwind-coffee");
  assert.equal(assistantPlace("/brands/northwind-coffee/rules", O), "/brands/northwind-coffee/rules");
  assert.equal(assistantPlace("/brands/northwind-coffee/guidelines?page=colors", O), "/brands/northwind-coffee/guidelines?page=colors");
});

test("nowhere else: other origins, other pages, query a place doesn't read", () => {
  for (const p of ["https://evil.example/", "//evil.example/", "/\\evil.example", "/settings", "/connections", "/brands/x/guidelines/edit", "/api/v1/keys", "/s/token", "brands", null, 3]) {
    assert.equal(assistantPlace(p, O), null, String(p));
  }
  assert.equal(assistantPlace("/brands/x/guidelines?page=a&git=1&panel=git", O), "/brands/x/guidelines?page=a");
  assert.equal(assistantPlace("/review?anything=1", O), "/review");
  assert.equal(assistantPlace("/?q=a&fields=1", O), "/?q=a");
});
