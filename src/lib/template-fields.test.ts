import assert from "node:assert/strict";
import { test } from "node:test";
import { TEMPLATES } from "./pages.ts";
import { fieldsOf, withProp } from "./template-fields.ts";

test("fieldsOf: a control for every prop of every template", () => {
  const kinds = (t: Parameters<typeof fieldsOf>[0]) => Object.fromEntries(fieldsOf(t).map((f) => [f.name, f.kind]));
  assert.deepEqual(kinds("cards"), { layout: "choice" });
  assert.deepEqual(kinds("palette"), { show: "multi", media: "choice", matrix: "switch", ase: "switch", simulate: "switch" });
  assert.deepEqual(kinds("pages"), { from: "page", layout: "choice", depth: "number" });
  assert.deepEqual(kinds("collection"), {
    collection: "collection",
    search: "search",
    query: "text",
    sort: "choice",
    limit: "number",
    layout: "choice",
    downloads: "switch",
  });
  assert.deepEqual(kinds("icons"), {
    collection: "collection",
    search: "search",
    query: "text",
    sort: "choice",
    limit: "number",
    size: "choice",
    downloads: "switch",
  });
  // An icon set lists by name unless told otherwise: the panel says so.
  const sort = fieldsOf("icons").find((f) => f.name === "sort");
  assert.equal(sort?.kind === "choice" && sort.fallback, "name");
  assert.equal(kinds("embed").url, "text");
  assert.equal(kinds("pattern").scales, "numbers");
  assert.equal(kinds("split").image, "asset");
  const formula = fieldsOf("type").find((f) => f.name === "formula");
  assert.equal(formula?.kind, "group");
  // Only copy's form has no control yet.
  const other = TEMPLATES.flatMap((t) => fieldsOf(t).flatMap((f) => (f.kind === "other" ? [`${t}.${f.name}`] : [])));
  assert.deepEqual(other, ["copy.form"]);
});

test("withProp: a default or an empty value leaves the prop out", () => {
  const [layout] = fieldsOf("cards");
  assert.deepEqual(withProp({}, layout, "list"), { layout: "list" });
  assert.deepEqual(withProp({ layout: "list" }, layout, "cards"), {});
  const aspect = fieldsOf("embed").find((f) => f.name === "aspect")!;
  assert.deepEqual(withProp({}, aspect, "auto"), {});
  assert.deepEqual(withProp({}, aspect, "16:9"), { aspect: "16:9" });
  const strip = fieldsOf("cover").find((f) => f.name === "strip")!;
  assert.deepEqual(withProp({}, strip, false), { strip: false });
  assert.deepEqual(withProp({ strip: false }, strip, true), {});
  const titleSize = fieldsOf("cover").find((f) => f.name === "titleSize")!;
  assert.deepEqual(withProp({ titleSize: "huge" }, titleSize, "large"), {});
  const show = fieldsOf("palette")[0];
  assert.deepEqual(withProp({ show: ["hex"] }, show, []), {});
});
