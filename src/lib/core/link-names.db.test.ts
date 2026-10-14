import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { request, signUp } from "@/test/db";
import { describeAsset, ingestBytes, updateAsset } from "@/lib/core/assets";
import { makeSignedUrl } from "@/lib/core/signing";
import { flushTraffic } from "@/lib/core/usage";
import { GET as file } from "@/app/a/[id]/[[...transform]]/route";

/** Links carry the asset's name for people; the server reads none of it (lib/asset-url.ts). */

const ada = await signUp("Ada");
const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 0, b: 0 } } }).png().toBuffer();
const { asset: uploaded } = await ingestBytes(ada.caller, { bytes, mime: "image/png", filename: "IMG_2034.png" });
const hero = (await updateAsset(ada.caller, uploaded.id, { title: "Summer hero" }))!;

const get = async (segments: string[], query = "") => {
  const res = await file(request({ cookie: ada.cookie }, `/a/${hero.id}/${segments.join("/")}${query}`), {
    params: Promise.resolve({ id: hero.id, transform: segments.length ? segments : undefined }),
  });
  const body = Buffer.from(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get("content-type"), saveAs: res.headers.get("content-disposition"), body };
};

test("a name after the id or the transform serves what the link without it serves", async () => {
  const plain = await get([]);
  assert.equal(plain.status, 200);
  assert.deepEqual((await get(["summer-hero.png"])).body, plain.body);
  // Whatever extension the name ends in: the transform says the format.
  const webp = await get(["w_64,f_webp"]);
  for (const named of [["w_64,f_webp", "summer-hero.webp"], ["w_64,f_webp", "summer-hero.png"], ["summer-hero.png", "w_64,f_webp"]]) {
    const r = await get(named);
    assert.equal(r.status, 200, named.join("/"));
    assert.equal(r.type, "image/webp");
    assert.deepEqual(r.body, webp.body);
  }
  await flushTraffic();
});

test("a malformed transform is refused, never taken for a name", async () => {
  for (const bad of [["w64"], ["w_64", "w_32"], ["a.png", "b.png"], ["w_64", "a.png", "b"]]) assert.equal((await get(bad)).status, 400, bad.join("/"));
});

test("a download is saved as the asset's name, in the format downloaded", async () => {
  assert.equal((await get([], "?download")).saveAs, `attachment; filename="Summer hero.png"; filename*=UTF-8''Summer%20hero.png`);
  assert.equal((await get(["w_64,f_webp", "old-name.png"], "?download")).saveAs, `attachment; filename="Summer hero.webp"; filename*=UTF-8''Summer%20hero.webp`);
  // Shown, a rendition says nothing: its link's name is what a browser saves it as.
  assert.equal((await get(["w_64,f_webp", "summer-hero.webp"])).saveAs, null);
  assert.equal((await get([])).saveAs, `inline; filename="Summer hero.png"; filename*=UTF-8''Summer%20hero.png`);
  await flushTraffic();
});

test("the URLs the API hands out are named", async () => {
  const d = describeAsset(hero);
  assert.match(d.urls.original, new RegExp(`/a/${hero.id}/summer-hero\\.png$`));
  assert.match(d.urls.download, new RegExp(`/a/${hero.id}/summer-hero\\.png\\?download$`));
  assert.ok(d.alternatives.some((x) => x.url.endsWith(`/a/${hero.id}/w_1200,f_webp/summer-hero.webp`)));
  const signed = await makeSignedUrl(ada.caller, hero.id, 3600, "/w_800,f_webp");
  assert.match(signed!.url, new RegExp(`/a/${hero.id}/w_800,f_webp/summer-hero\\.webp\\?s=`));
});
