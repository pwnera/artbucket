import assert from "node:assert/strict";
import { test } from "node:test";
import { gitLink } from "./git.ts";

test("a brand's slug fills the template; none leaves it empty, to bring a brand in", () => {
  const t = "https://app.example/github/connect?brand={brand}";
  assert.equal(gitLink(t, "acme"), "https://app.example/github/connect?brand=acme");
  assert.equal(gitLink(t, "a b"), "https://app.example/github/connect?brand=a%20b");
  assert.equal(gitLink(t), "https://app.example/github/connect?brand=");
});
