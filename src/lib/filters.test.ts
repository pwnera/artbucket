import assert from "node:assert/strict";
import { test } from "node:test";
import type { FieldDef } from "./fields.ts";
import { FilterError, parseFieldFilters } from "./filters.ts";

const defs: FieldDef[] = [
  { key: "channel", label: "Channel", type: "select", options: ["web", "print"], required: false },
  { key: "budget", label: "Budget", type: "number", options: [], required: false },
  { key: "expires", label: "Expires", type: "date", options: [], required: false },
  { key: "approved", label: "Approved", type: "boolean", options: [], required: false },
  { key: "agency", label: "Agency", type: "text", options: [], required: false },
];

const parse = (qs: string) => parseFieldFilters(new URLSearchParams(qs), defs);

test("repeated values of one field collect into one OR", () => {
  assert.deepEqual(parse("q=fox&f.channel=web&f.channel=print"), [
    { key: "channel", op: "in", values: ["web", "print"] },
  ]);
});

test("values are typed against the schema", () => {
  assert.deepEqual(parse("f.approved=false&f.budget.gte=10&f.expires.lte=2027-01-31&f.agency=Acme"), [
    { key: "approved", op: "in", values: [false] },
    { key: "budget", op: "gte", value: 10 },
    { key: "expires", op: "lte", value: "2027-01-31" },
    { key: "agency", op: "in", values: ["Acme"] },
  ]);
});

test("bad filters fail loudly instead of matching nothing", () => {
  for (const qs of [
    "f.nope=1",
    "f.channel=tv",
    "f.budget.gte=ten",
    "f.budget.gte=",
    "f.approved=yes",
    "f.expires.gte=31/01/2027",
    "f.channel.gte=web",
    "f.budget.between=1",
  ]) {
    assert.throws(() => parse(qs), FilterError, qs);
  }
});
