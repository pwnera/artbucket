import assert from "node:assert/strict";
import { test } from "node:test";
import { signUp } from "@/test/db";
import { ingestBytes, updateAsset } from "@/lib/core/assets";
import { publishBrand, setRules } from "@/lib/core/brand";
import { brandCard } from "@/lib/core/cards";
import { CardQuery } from "@/lib/cards";

const svg = (fill: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="${fill}"/></svg>`);
const q = (more: Record<string, string> = {}) => CardQuery.parse({ title: "Hello", ...more });
const nobody = () => false;

test("a card follows the release: a new release changes its ETag, a pinned one keeps it, and the draft never shows", async () => {
  const { caller } = await signUp("Ada");
  const ws = caller.project.id;
  const logo = (await ingestBytes(caller, { bytes: svg("#e11d48"), mime: "image/svg+xml", filename: "logo.svg" })).asset;
  await setRules(caller, undefined, {
    set: [
      { key: "color.primary", type: "color", value: "#e11d48" },
      { key: "logo.primary", type: "text", value: "The logo", assets: [{ id: logo.id, rendition: null }] },
    ],
  } as Parameters<typeof setRules>[2]);
  const first = (await publishBrand(caller, undefined)).number;
  const one = await brandCard(ws, undefined, undefined, "og", q(), nobody);
  assert.equal(one.version, first);
  assert.equal((await brandCard(ws, undefined, undefined, "og", q(), nobody)).etag, one.etag);
  assert.notEqual((await brandCard(ws, undefined, undefined, "og", q({ theme: "dark" }), nobody)).etag, one.etag);

  // Edited, not released: the card is the release's still.
  await setRules(caller, undefined, { set: [{ key: "color.primary", type: "color", value: "#2563eb" }] } as Parameters<typeof setRules>[2]);
  assert.equal((await brandCard(ws, undefined, undefined, "og", q(), nobody)).etag, one.etag);
  const second = (await publishBrand(caller, undefined)).number;
  const two = await brandCard(ws, undefined, undefined, "og", q(), nobody);
  assert.equal(two.version, second);
  assert.notEqual(two.etag, one.etag);
  assert.equal((await brandCard(ws, undefined, first, "og", q(), nobody)).etag, one.etag);

  // A logo archived since leaves the card, release or not.
  await updateAsset(caller, logo.id, { status: "archived" });
  assert.notEqual((await brandCard(ws, undefined, first, "og", q(), nobody)).etag, one.etag);
  await assert.rejects(brandCard(ws, undefined, second + 5, "og", q(), nobody), /never published/);
});

test("a card's picture: the release's own, or one the caller may see in this project; never another project's", async () => {
  const { caller } = await signUp("Grace");
  const ws = caller.project.id;
  const shown = (await ingestBytes(caller, { bytes: svg("#16a34a"), mime: "image/svg+xml", filename: "hero.svg" })).asset;
  const loose = (await ingestBytes(caller, { bytes: svg("#ca8a04"), mime: "image/svg+xml", filename: "loose.svg" })).asset;
  await setRules(caller, undefined, { set: [{ key: "imagery.hero", type: "text", value: "Hero", assets: [{ id: shown.id, rendition: null }] }] } as Parameters<typeof setRules>[2]);
  await publishBrand(caller, undefined);

  await brandCard(ws, undefined, undefined, "og", q({ image: shown.id }), nobody);
  await assert.rejects(brandCard(ws, undefined, undefined, "og", q({ image: loose.id }), nobody), /no picture by that id/);
  await brandCard(ws, undefined, undefined, "og", q({ image: loose.id }), (a) => a.id === loose.id);

  const other = await signUp("Hedy");
  const theirs = (await ingestBytes(other.caller, { bytes: svg("#000000"), mime: "image/svg+xml", filename: "theirs.svg" })).asset;
  await assert.rejects(brandCard(ws, undefined, undefined, "og", q({ image: theirs.id }), () => true), /no picture by that id/);
});
