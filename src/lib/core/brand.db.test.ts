import assert from "node:assert/strict";
import { test } from "node:test";
import { plan, signUp } from "@/test/db";
import { createBrand, publishBrand } from "@/lib/core/brand";
import { AssetError } from "@/lib/core/errors";
import { listBrands } from "@/lib/core/brands";
import { makeBrand } from "@/lib/core/templates";

const refused = (err: unknown) => err instanceof AssetError && err.code === "limit_reached" && (err.detail as { limit: string }).limit === "brands";

test("a plan of one brand: the project's untouched default brand doesn't take the slot, the next brand does", async () => {
  const { caller } = await signUp("Ada");
  await plan(caller.project.organizationId, { brands: 1 });
  const made = await createBrand(caller, { name: "Acme" });
  assert.equal(made.slug, "acme");
  await assert.rejects(createBrand(caller, { name: "Globex" }), refused);
});

test("once the default brand is released it counts, and a plan of one is full", async () => {
  const { caller } = await signUp("Linus");
  await plan(caller.project.organizationId, { brands: 1 });
  await publishBrand(caller, undefined);
  await assert.rejects(createBrand(caller, { name: "Initech" }), refused);
});

test("without a plan's limit, brands are as many as anyone makes", async () => {
  const { caller } = await signUp("Barbara");
  for (const name of ["One", "Two", "Three"]) await createBrand(caller, { name });
});

test("a dry run says whether a brand may be made, and makes none", async () => {
  const { caller } = await signUp("Grace");
  await plan(caller.project.organizationId, { brands: 1 });
  const before = (await listBrands(caller.project.id, caller)).length;
  assert.deepEqual(await makeBrand(caller, { name: "Acme", dryRun: true }), { dryRun: true });
  assert.equal((await listBrands(caller.project.id, caller)).length, before);
  await createBrand(caller, { name: "Acme" });
  await assert.rejects(makeBrand(caller, { name: "Globex", dryRun: true }), refused);
});
