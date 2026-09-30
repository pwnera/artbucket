import assert from "node:assert/strict";
import { test } from "node:test";
import { referrerHost, searchWords } from "./insights.ts";

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
