import assert from "node:assert/strict";
import { test } from "node:test";
import { request, signUp } from "@/test/db";
import { authorize } from "@/lib/api";
import { callerFrom } from "@/lib/core/access";
import { createBrand, createRule, listRules } from "@/lib/core/brand";
import { ingestBytes } from "@/lib/core/assets";
import sharp from "sharp";
import { listBrands, resolveBrand, updateBrand } from "@/lib/core/brands";
import { parseQuery } from "@/lib/catalog";
import { searchCatalog, whoCan } from "@/lib/core/catalog";
import { acceptInvitation, createInvitation, setGrant } from "@/lib/core/people";
import { handleMcp } from "@/lib/mcp";
import { createPortal } from "@/lib/core/portals";
import { exportBrand, importBrand } from "@/lib/core/brand-sync";

const ada = await signUp("Ada");
const ws = ada.caller.project;
await createBrand(ada.caller, { name: "Acme", slug: "acme" });
await createBrand(ada.caller, { name: "Acme Kids", slug: "kids" });
const kids = await resolveBrand(ws.id, "kids");

// Sam reads the project and edits Acme Kids only.
const sam = await signUp("Sam");
const { url } = await createInvitation(ada.caller, { email: sam.user.email, resource: "project", resourceId: ws.id, scope: "read" });
await acceptInvitation(url.split("/invite/")[1], { ...sam.user, ip: null });
await setGrant(ada.caller, { user: sam.user.id, resource: "brand", resourceId: kids.id, scope: "write" });
const asSam = (path: string, method = "PATCH") => new Request(new URL(path, process.env.APP_URL), { method, headers: { cookie: `${sam.cookie}; ab_project=${ws.id}`, authorization: "" } });
const samHere = async () => (await callerFrom(request({ cookie: `${sam.cookie}; ab_project=${ws.id}` })))!;

test("a grant on one brand edits that brand, and no other", async () => {
  const ok = await authorize(asSam("/api/v1/brands/kids/theme"), "brand.edit");
  assert.ok(!(ok instanceof Response), "kids");
  const no = await authorize(asSam("/api/v1/brands/acme/theme"), "brand.edit");
  assert.ok(no instanceof Response && no.status === 403, "acme");
  // Rules name their brand by ?brand=, the default otherwise.
  const rules = await authorize(asSam("/api/v1/brand/rules?brand=kids", "POST"), "brand.edit");
  assert.ok(!(rules instanceof Response));
});

test("making brands is the project's, not a brand's", async () => {
  const no = await authorize(asSam("/api/v1/brands", "POST"), "brand.create");
  assert.ok(no instanceof Response && no.status === 403);
});

test("a private brand is gone for the project's readers, there for its grants and admins", async () => {
  await updateBrand(ws.id, "acme", { private: true });
  const sams = (await listBrands(ws.id, await samHere())).map((b) => b.slug);
  assert.ok(!sams.includes("acme"));
  assert.ok(sams.includes("kids"));
  assert.ok((await listBrands(ws.id, ada.caller)).some((b) => b.slug === "acme"));
  const gone = await authorize(asSam("/api/v1/brands/acme", "GET"), "brand.read");
  assert.ok(gone instanceof Response && gone.status === 404, "not there for Sam");
  assert.equal((await searchCatalog(await samHere(), parseQuery("type:brand"))).items.some((i) => i.slug === "acme"), false);
});

test("MCP resources/read refuses a private brand's rules and pages to a reader without a grant on it", async () => {
  const sam = await samHere();
  const read = async (uri: string, caller = sam) =>
    (await handleMcp({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri } }, caller)) as { result?: unknown; error?: { code: number } };
  for (const uri of ["artbucket://brands/acme/rules", "artbucket://brands/acme/rules/social", "artbucket://brands/acme/pages/overview"]) {
    assert.equal((await read(uri)).error?.code, -32002, uri);
  }
  assert.ok((await read("artbucket://brands/kids/rules")).result, "kids, Sam's grant");
  assert.ok((await read("artbucket://brands/acme/rules", ada.caller)).result, "an admin");
});

test("a portal shows a private brand only for whoever may release it", async () => {
  // An editor of the project, with no grant on private Acme.
  const editor = { ...ada.caller, scope: "write" as const };
  const slug = () => `kit-${Math.random().toString(36).slice(2, 8)}`;
  await assert.rejects(createPortal(editor, { name: "Kit", slug: slug(), access: "public", brands: ["acme"] }), /No brand "acme"/);
  await createPortal(editor, { name: "Kit", slug: slug(), access: "public", brands: ["kids"] });
  await createPortal(ada.caller, { name: "Kit", slug: slug(), access: "public", brands: ["acme"] });
});

test("rules found by their asset leave out a private brand the caller can't read", async () => {
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer();
  const { asset } = await ingestBytes(ada.caller, { bytes, mime: "image/png", filename: "logo.png" });
  await createRule(ada.caller, "acme", { key: "logo.secret", type: "text", value: "The launch logo", assets: [{ id: asset.id, rendition: null }] });
  await createRule(ada.caller, "kids", { key: "logo.kids", type: "text", value: "The kids logo", assets: [{ id: asset.id, rendition: null }] });
  const ws = ada.caller.project.id;
  assert.deepEqual((await listRules(ws, { asset: asset.id, who: await samHere() })).map((r) => r.key), ["logo.kids"]);
  assert.deepEqual((await listRules(ws, { asset: asset.id, who: ada.caller })).map((r) => r.key).sort(), ["logo.kids", "logo.secret"]);
});

test("a rule takes only assets its editor can see", async () => {
  const png = (r: number) => sharp({ create: { width: 8, height: 8, channels: 3, background: { r, g: 7, b: 7 } } }).png().toBuffer();
  const hidden = (await ingestBytes(ada.caller, { bytes: await png(1), mime: "image/png", filename: "embargo.png", private: true })).asset;
  const open = (await ingestBytes(ada.caller, { bytes: await png(2), mime: "image/png", filename: "open.png" })).asset;
  const sam = await samHere();
  await assert.rejects(createRule(sam, "kids", { key: "logo.leak", type: "text", value: "x", assets: [{ id: hidden.id, rendition: null }] }), /No such asset/);
  const rule = await createRule(sam, "kids", { key: "logo.open", type: "text", value: "x", assets: [{ id: open.id, rendition: null }] });
  assert.deepEqual(rule.assets.map((a) => a.id), [open.id]);
});

test("brand files take only assets their importer can see, or the brand already holds", async () => {
  const png = (r: number) => sharp({ create: { width: 8, height: 8, channels: 3, background: { r, g: 9, b: 9 } } }).png().toBuffer();
  const held = (await ingestBytes(ada.caller, { bytes: await png(3), mime: "image/png", filename: "held.png", private: true })).asset;
  const other = (await ingestBytes(ada.caller, { bytes: await png(4), mime: "image/png", filename: "other.png", private: true })).asset;
  // An admin puts a private logo on the brand in the app: the files going back and forth with Git keep it.
  await createRule(ada.caller, "kids", { key: "logo.held", type: "text", value: "x", assets: [{ id: held.id, rendition: null }] });
  const { files } = await exportBrand(ws.id, "kids");
  const sam = await samHere();
  await importBrand(sam, "kids", { files, dryRun: true });
  // The same files naming another private asset, by id: not there for Sam, whatever the id says.
  const swapped = Object.fromEntries(Object.entries(files).map(([p, t]) => [p, t.replaceAll(held.id, other.id)]));
  await assert.rejects(importBrand(sam, "kids", { files: swapped, dryRun: true }), new RegExp(`no asset ${other.id}`));
});

test("who can reach it: the brand grant, said as such", async () => {
  const w = (await whoCan(ada.caller, kids.id))!;
  const s = w.holders.find((h) => h.who === "Sam")!;
  assert.equal(s.role, "Editor");
  assert.equal(s.via, "Directly on this brand");
});
