import assert from "node:assert/strict";
import { test } from "node:test";
import { describeIssues, fieldsValidator, missingRequired, relaxInherited, type FieldDef } from "./fields.ts";

const defs: FieldDef[] = [
  { key: "campaign", label: "Campaign", type: "text", options: [], required: true },
  { key: "channel", label: "Channel", type: "select", options: ["web", "print"], required: false },
  { key: "budget", label: "Budget", type: "number", options: [], required: false },
  { key: "expires", label: "Expires", type: "date", options: [], required: false },
  { key: "approved", label: "Approved", type: "boolean", options: [], required: false },
];

const upload = fieldsValidator(defs, "upload");
const patch = fieldsValidator(defs, "patch");

test("upload: a valid set passes, with text trimmed", () => {
  assert.deepEqual(
    upload.parse({ campaign: " Autumn ", channel: "web", budget: 12.5, expires: "2027-01-31", approved: true }),
    { campaign: "Autumn", channel: "web", budget: 12.5, expires: "2027-01-31", approved: true },
  );
});

test("upload: required fields are required, blank counts as missing", () => {
  assert.equal(upload.safeParse({}).success, false);
  assert.equal(upload.safeParse({ campaign: "  " }).success, false);
  assert.equal(upload.safeParse({ campaign: "x" }).success, true);
});

test("values must match their type", () => {
  assert.equal(upload.safeParse({ campaign: "x", channel: "tv" }).success, false);
  assert.equal(upload.safeParse({ campaign: "x", budget: "12" }).success, false);
  assert.equal(upload.safeParse({ campaign: "x", expires: "31/01/2027" }).success, false);
  assert.equal(upload.safeParse({ campaign: "x", approved: "yes" }).success, false);
});

test("unknown keys fail loudly", () => {
  assert.equal(upload.safeParse({ campaign: "x", campaing: "y" }).success, false);
});

test("patch: partial, null clears an optional field but not a required one", () => {
  assert.deepEqual(patch.parse({ channel: null }), { channel: null });
  assert.deepEqual(patch.parse({}), {});
  assert.equal(patch.safeParse({ campaign: null }).success, false);
});

test("an inherited value satisfies a required field", () => {
  const relaxed = relaxInherited(defs, { campaign: "Autumn" });
  assert.equal(fieldsValidator(relaxed, "upload").safeParse({}).success, true);
  assert.deepEqual(fieldsValidator(relaxed, "patch").parse({ campaign: null }), { campaign: null });
});

test("errors name the field and the problem", () => {
  const r = upload.safeParse({ campaign: "x", budget: "12", channel: "tv", nope: 1 });
  assert.equal(r.success, false);
  const msg = describeIssues(r.error!);
  assert.match(msg, /unknown field "nope"/);
  assert.match(msg, /budget: expected number/);
  assert.match(msg, /channel: /);
});

test("approving needs every required field, own or inherited", () => {
  assert.deepEqual(missingRequired(defs, {}).map((d) => d.key), ["campaign"]);
  assert.deepEqual(missingRequired(defs, { campaign: "" }).map((d) => d.key), ["campaign"]);
  assert.deepEqual(missingRequired(defs, { campaign: "Autumn" }), []);
});
