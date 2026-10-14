import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { request, signUp } from "@/test/db";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { ingestBytes } from "@/lib/core/assets";
import { createBrand, createRule, publishBrand } from "@/lib/core/brand";
import { officeResponse, releasedOffice } from "@/lib/core/office";
import { createPortal, portalOffice } from "@/lib/core/portals";
import { pngSize } from "@/lib/office";
import { unzip } from "@/lib/zip";

const ada = await signUp("Ada");
const ws = ada.caller.project.id;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50"><rect width="200" height="50" fill="#6d4aff"/></svg>`;
const logo = (await ingestBytes(ada.caller, { bytes: Buffer.from(svg), mime: "image/svg+xml", filename: "logo.svg" })).asset;
await createBrand(ada.caller, { name: "Acme", slug: "acme" });
await createRule(ada.caller, "acme", { key: "color.primary", type: "color", value: "#6d4aff" });
await createRule(ada.caller, "acme", { key: "logo.primary", type: "text", value: "The logo", assets: [{ id: logo.id, rendition: null }] });
const release = (await publishBrand(ada.caller, "acme", { note: "First" })).number;
const slug = `press-${Date.now().toString(36)}`;
await createPortal(ada.caller, { name: "Press", slug, access: "password", password: "open sesame 1", brands: ["acme"] });

const files = async (bytes: Uint8Array) => new Map(await Promise.all(unzip(bytes).map(async (e) => [e.name, await e.read()] as const)));

test("a release as a .potx: its accent in the theme, its SVG logo drawn as a PNG on the master", async () => {
  const t = await releasedOffice(ws, "acme", "live", "potx");
  assert.equal(t.filename, `acme-v${release}.potx`);
  const parts = await files(t.bytes);
  assert.match(new TextDecoder().decode(parts.get("ppt/theme/theme1.xml")), /<a:accent1><a:srgbClr val="6D4AFF"\/>/);
  // Drawn at the template's size, not the file's own 200 by 50.
  assert.deepEqual(pngSize(parts.get("ppt/media/logo.png")!), { width: 1600, height: 400 });
  // The same release is the same bytes, so the reader's copy answers a 304.
  assert.equal((await releasedOffice(ws, "acme", release, "potx")).etag, t.etag);
  assert.equal(officeResponse(request({ "if-none-match": t.etag }), t).status, 304);
  const res = officeResponse(request(), t);
  assert.equal(res.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.presentationml.template");
  assert.equal(res.headers.get("content-disposition"), `attachment; filename="acme-v${release}.potx"; filename*=UTF-8''acme-v${release}.potx`);
});

test("a release never made is a 404, and a draft is never a template", async () => {
  await assert.rejects(releasedOffice(ws, "acme", 9, "dotx"), /Version 9 was never released/);
  await createBrand(ada.caller, { name: "Draft", slug: "draft" });
  await createRule(ada.caller, "draft", { key: "color.primary", type: "color", value: "#111111" });
  await publishBrand(ada.caller, "draft");
  await createRule(ada.caller, "draft", { key: "color.ink", type: "color", value: "#222222" });
  // Its release has one color; the draft's second stays out.
  const theme = new TextDecoder().decode((await files((await releasedOffice(ws, "draft", "live", "dotx")).bytes)).get("word/theme/theme1.xml"));
  assert.doesNotMatch(theme, /222222/);
});

test("a portal's template is behind its door, and a logo that may not leave stays out", async () => {
  await assert.rejects(portalOffice(slug, {}, "acme", "dotx"), /needs a password/);
  await assert.rejects(portalOffice(slug, { password: "open sesame 1" }, "nope", "dotx"), /isn't in this portal/);
  const t = await portalOffice(slug, { password: "open sesame 1" }, "acme", "dotx");
  assert.ok((await files(t.bytes)).has("word/media/logo.png"));

  await db.update(assets).set({ rights: { license: null, territories: [], channels: [], embargo: null, expires: null, modelRelease: null, downloadable: false } }).where(eq(assets.id, logo.id));
  const kept = await files((await portalOffice(slug, { password: "open sesame 1" }, "acme", "dotx")).bytes);
  assert.ok(![...kept.keys()].some((n) => n.includes("logo") || n.includes("header")));
});
