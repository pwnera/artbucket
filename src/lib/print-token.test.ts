import assert from "node:assert/strict";
import { test } from "node:test";
import { printToken, readPrintToken } from "./print-token.ts";

test("a print token carries its claim back, for its secret and its minutes only", () => {
  const claim = { ws: "ws1", brand: "rust", page: "logo", context: "dark" };
  const t = printToken("s3cret", claim, 60);
  assert.deepEqual(readPrintToken("s3cret", t), claim);
  assert.equal(readPrintToken("other", t), null);
  assert.equal(readPrintToken("s3cret", t, new Date(Date.now() + 61_000)), null);
  assert.equal(readPrintToken("s3cret", `${t}x`), null);
  assert.equal(readPrintToken("s3cret", "nodot"), null);
  assert.deepEqual(readPrintToken("s3cret", printToken("s3cret", { ws: "w", brand: "b", page: null }))?.page, null);
});
