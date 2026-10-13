import assert from "node:assert/strict";
import { test } from "node:test";
import { plan, signUp } from "@/test/db";
import { ingestBytes, updateAsset } from "@/lib/core/assets";
import { createBrand, publishBrand, setRules } from "@/lib/core/brand";
import { AssetError } from "@/lib/core/errors";
import { listBrands } from "@/lib/core/brands";
import { releasedRules } from "@/lib/core/portals";
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

test("a site reads a release, never the draft, with only the files that may leave the team", async () => {
  const { caller } = await signUp("Hedy");
  const svg = (fill: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="${fill}"/></svg>`);
  const logo = (await ingestBytes(caller, { bytes: svg("#e11d48"), mime: "image/svg+xml", filename: "logo.svg" })).asset;
  const mark = (await ingestBytes(caller, { bytes: svg("#111111"), mime: "image/svg+xml", filename: "mark.svg" })).asset;
  await setRules(caller, undefined, {
    set: [
      { key: "color.primary", type: "color", value: "#e11d48" },
      { key: "logo.primary", type: "text", value: "The logo", assets: [{ id: logo.id, rendition: null }] },
      { key: "logo.mark", type: "text", value: "The mark", assets: [{ id: mark.id, rendition: null }] },
    ],
  } as Parameters<typeof setRules>[2]);
  // Edited and never released: nothing a site may show yet.
  await assert.rejects(releasedRules(caller.project.id, undefined, "live"), /isn't published yet/);
  const first = (await publishBrand(caller, undefined)).number;
  await setRules(caller, undefined, { set: [{ key: "color.primary", type: "color", value: "#2563eb" }] } as Parameters<typeof setRules>[2]);
  await updateAsset(caller, mark.id, { status: "archived" });

  const live = await releasedRules(caller.project.id, undefined, "live");
  assert.equal(live.version?.number, first);
  const by = (key: string) => live.data.find((r) => r.key === key)!;
  assert.equal(by("color.primary").value, "#e11d48");
  assert.deepEqual(by("logo.primary").assets.map((a) => [a.id, a.filename, a.mime]), [[logo.id, "logo.svg", "image/svg+xml"]]);
  // Archived since: still in the rule, no longer a file a site may show.
  assert.deepEqual(by("logo.mark").assets, []);
  await assert.rejects(releasedRules(caller.project.id, undefined, first + 5), /never published/);
});
