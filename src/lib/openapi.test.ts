import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import { DOCS_SERVER, openapi } from "./openapi.ts";

const APP = join(import.meta.dirname, "..", "app");
const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"];

/**
 * Every route.ts under app/, as [openapi path, exported methods]. /api/auth
 * is better-auth's own surface (signing in), documented by better-auth.
 */
function routes(): [string, string[]][] {
  return readdirSync(APP, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(`${sep}route.ts`) || f === "route.ts")
    .filter((f) => !f.startsWith(join("api", "auth")))
    .map((f) => {
      const dir = relative(APP, join(APP, f, "..")).split(sep);
      const path =
        "/" +
        dir
          .map((s) => s.replace(/^\[\[\.\.\.(\w+)\]\]$/, "{$1}").replace(/^\[(\w+)\]$/, "{$1}"))
          .join("/");
      const src = readFileSync(join(APP, f), "utf8");
      const methods = METHODS.filter((m) => new RegExp(`export (const|async function|function) ${m}\\b`).test(src));
      return [path, methods];
    });
}

test("the spec describes every route and method the app serves", () => {
  const spec = openapi("http://localhost:3000").paths as Record<string, Record<string, unknown>>;
  const found = routes();
  assert.ok(found.length > 10, "found the route files");
  for (const [path, methods] of found) {
    // An optional catch-all serves both /a/{id} and /a/{id}/{transform}.
    const paths = path.endsWith("/{transform}") ? [path.replace("/{transform}", ""), path] : [path];
    for (const p of paths)
      for (const m of methods) assert.ok(spec[p]?.[m.toLowerCase()], `${m} ${p} is missing from the OpenAPI spec`);
  }
});

test("the spec documents no route that doesn't exist", () => {
  const served = new Set(routes().flatMap(([p]) => (p.endsWith("/{transform}") ? [p, p.replace("/{transform}", "")] : [p])));
  for (const p of Object.keys(openapi("x").paths)) assert.ok(served.has(p), `${p} is documented but not served`);
});

test("it serializes to JSON", () => {
  assert.doesNotThrow(() => JSON.stringify(openapi("http://localhost:3000")));
});

test("the docs' API reference is this spec: run pnpm docs:openapi after changing the API", () => {
  const docs = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "docs", "openapi.json"), "utf8"));
  assert.deepEqual(docs, JSON.parse(JSON.stringify(openapi(DOCS_SERVER))));
});
