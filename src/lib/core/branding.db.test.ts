import assert from "node:assert/strict";
import { test } from "node:test";
import { signUp } from "@/test/db";
import { publishBrand, setRules } from "@/lib/core/brand";
import { brandOf } from "@/lib/core/branding";
import { listBrands } from "@/lib/core/brands";
import { updateSetting } from "@/lib/core/settings";

const primary = (value: string) => ({ set: [{ key: "color.primary", type: "color", value }] }) as Parameters<typeof setRules>[2];

test("an accent following a brand is its released primary: a release recolors the app, a draft doesn't", async () => {
  const { caller } = await signUp("Ada");
  const org = caller.project.organizationId;
  const [brand] = await listBrands(caller.project.id);
  await setRules(caller, undefined, primary("#E11D48"));
  await updateSetting(caller, "organization", "branding", { accent: "#111111", accentFrom: brand.id });
  // Never released: the accent set beside it stands.
  assert.equal((await brandOf(org)).accent, "#111111");
  await publishBrand(caller, undefined);
  assert.deepEqual(await brandOf(org).then((b) => [b.accent, b.custom]), ["#e11d48", true]);
  await setRules(caller, undefined, primary("#2563eb"));
  assert.equal((await brandOf(org)).accent, "#e11d48");
  await publishBrand(caller, undefined);
  assert.equal((await brandOf(org)).accent, "#2563eb");
  // Following a brand and nothing else keeps the product's own marks.
  await updateSetting(caller, "organization", "branding", { accent: null });
  assert.equal((await brandOf(org)).custom, false);
});

test("another organization's brand gives no accent", async () => {
  const { caller: theirs } = await signUp("Mallory");
  const [brand] = await listBrands(theirs.project.id);
  await setRules(theirs, undefined, primary("#e11d48"));
  await publishBrand(theirs, undefined);
  const { caller } = await signUp("Grace");
  await updateSetting(caller, "organization", "branding", { accentFrom: brand.id });
  assert.equal((await brandOf(caller.project.organizationId)).accent, null);
});
