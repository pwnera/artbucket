import assert from "node:assert/strict";
import { test } from "node:test";
import { refusedValue } from "./refused.ts";

test("Postgres refusing a value is the caller's mistake, found on the error or the cause drizzle wraps it in", () => {
  // invalid_byte_sequence: a NUL in text; untranslatable_character: \u0000 in jsonb.
  assert.equal(refusedValue({ code: "22021" }), "invalid");
  assert.equal(refusedValue(Object.assign(new Error("Failed query"), { cause: { code: "22P05" } })), "invalid");
  // invalid_text_representation: "not-a-uuid" where a uuid goes names nothing.
  assert.equal(refusedValue(Object.assign(new Error("Failed query"), { cause: { code: "22P02" } })), "not_found");
  // drizzle refuses an update with nothing to set before it reaches Postgres.
  assert.equal(refusedValue(new Error("No values to set")), "empty");
  // unique_violation: two requests took the same name or slug at once; the loser's is taken.
  assert.equal(refusedValue(Object.assign(new Error("Failed query"), { cause: { code: "23505" } })), "conflict");
  // foreign_key_violation: what the write points at (a thread's first comment) was deleted meanwhile.
  assert.equal(refusedValue(Object.assign(new Error("Failed query"), { cause: { code: "23503" } })), "not_found");
  // A deadlock or a serialization failure: Postgres undid it, so the caller can try again.
  assert.equal(refusedValue(Object.assign(new Error("Failed query"), { cause: { code: "40P01" } })), "retry");
  assert.equal(refusedValue({ code: "40001" }), "retry");
  for (const other of [new Error("boom"), { code: "23502" }, null, undefined, "22021"]) assert.equal(refusedValue(other), null);
});
