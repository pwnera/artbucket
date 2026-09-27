import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { apiBreaks, schemaBreaks, toolBreaks, unfrozen } from "./contract.ts";
import { toolSchemas } from "./mcp-tools.ts";
import { DOCS_SERVER, openapi } from "./openapi.ts";

const frozen = (f: string) => JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "contract", f), "utf8"));
const current = () => JSON.parse(JSON.stringify(openapi(DOCS_SERVER).paths));

test("/api/v1 keeps the promise it made at 1.0", () => {
  assert.deepEqual(apiBreaks(frozen("api-v1.json"), current()), []);
});

test("MCP tools keep their signatures", () => {
  assert.deepEqual(toolBreaks(frozen("mcp-v1.json"), JSON.parse(JSON.stringify(toolSchemas()))), []);
});

test("what was added is frozen too: run pnpm contract:freeze", () => {
  assert.deepEqual(unfrozen(frozen("api-v1.json"), current()), []);
  assert.deepEqual(Object.keys(toolSchemas()).filter((t) => !(t in frozen("mcp-v1.json"))), []);
});

const obj = (properties: object, required: string[] = []) => ({ type: "object", properties, required });
const str = { type: "string" };

test("inputs: adding optional is free, requiring or removing breaks", () => {
  const old = obj({ a: str });
  assert.deepEqual(schemaBreaks(old, obj({ a: str, b: str }), "input", "x"), []);
  assert.deepEqual(schemaBreaks(old, obj({ a: str, b: str }, ["b"]), "input", "x"), ["x.b: newly required"]);
  assert.deepEqual(schemaBreaks(old, obj({}), "input", "x"), ["x.a: removed"]);
});

test("inputs: tighter bounds and fewer choices break, looser ones don't", () => {
  assert.deepEqual(schemaBreaks({ type: "string", maxLength: 10 }, { type: "string", maxLength: 20 }, "input", "x"), []);
  assert.deepEqual(schemaBreaks({ type: "string", maxLength: 10 }, { type: "string", maxLength: 5 }, "input", "x"), ["x: maxLength went from 10 to 5"]);
  assert.deepEqual(schemaBreaks({ type: "string", enum: ["a", "b"] }, { type: "string", enum: ["a", "b", "c"] }, "input", "x"), []);
  assert.deepEqual(schemaBreaks({ type: "string", enum: ["a", "b"] }, { type: "string", enum: ["a"] }, "input", "x"), ['x: no longer takes "b"']);
  assert.deepEqual(schemaBreaks({ type: "integer" }, { type: "number" }, "input", "x"), []);
  assert.deepEqual(schemaBreaks({ type: "number" }, { type: "integer" }, "input", "x"), ["x: type number became integer"]);
});

test("outputs: adding is free, a property gone or optional breaks", () => {
  const old = obj({ a: str }, ["a"]);
  assert.deepEqual(schemaBreaks(old, obj({ a: str, b: str }, ["a", "b"]), "output", "x"), []);
  assert.deepEqual(schemaBreaks(old, obj({ a: str }), "output", "x"), ["x.a: may now be missing"]);
  assert.deepEqual(schemaBreaks(old, obj({}), "output", "x"), ["x.a: removed"]);
  // A new enum value in an output is an addition: clients tolerate values they don't know (docs: stability).
  assert.deepEqual(schemaBreaks({ type: "string", enum: ["a"] }, { type: "string", enum: ["a", "b"] }, "output", "x"), []);
});

test("nullable: an output that may now be null breaks, an input that takes null too doesn't", () => {
  const nullable = { anyOf: [str, { type: "null" }] };
  assert.deepEqual(schemaBreaks(str, nullable, "input", "x"), []);
  assert.deepEqual(schemaBreaks(str, nullable, "output", "x"), ["x: may now be null"]);
  assert.deepEqual(schemaBreaks(nullable, str, "input", "x"), ["x: no longer accepts null"]);
});

test("routes: removed, or needing more, breaks", () => {
  const op = (scope: string) => ({ "x-scope": scope, responses: { 200: { description: "ok" } } });
  assert.deepEqual(apiBreaks({ "/a": { get: op("read") } }, { "/a": { get: op("read") }, "/b": { get: op("admin") } }), []);
  assert.deepEqual(apiBreaks({ "/a": { get: op("read") } }, {}), ["GET /a: removed"]);
  assert.deepEqual(apiBreaks({ "/a": { get: op("read") } }, { "/a": { get: op("write") } }), ["GET /a: needs write, was read"]);
  assert.deepEqual(
    apiBreaks(
      { "/a": { get: { responses: { 200: {} } } } },
      { "/a": { get: { parameters: [{ name: "q", in: "query", required: true }], responses: { 200: {} } } } },
    ),
    ["GET /a: new required query parameter q"],
  );
});
