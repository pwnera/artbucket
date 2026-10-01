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
  for (const other of [new Error("boom"), { code: "23505" }, { cause: { code: "40001" } }, null, undefined, "22021"]) assert.equal(refusedValue(other), null);
});
