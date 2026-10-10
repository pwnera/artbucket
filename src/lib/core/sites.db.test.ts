import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { signUp } from "@/test/db";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { ingestBytes } from "@/lib/core/assets";
import { createCollection } from "@/lib/core/collections";
import { createPortal } from "@/lib/core/portals";
import { deploy, listDeployments, siteFile } from "@/lib/core/sites";
import { lineage } from "@/lib/core/catalog";
import { zip } from "@/lib/zip";

const ada = await signUp("Sitesada");
const text = (s: string) => new TextEncoder().encode(s);
const pack = (files: Record<string, string>) => zip(Object.entries(files).map(([name, s]) => ({ name, data: text(s) })));
const docs = await createPortal(ada.caller, { name: "Docs", slug: `docs-${Date.now().toString(36)}`, kind: "docs" });

test("a zip goes live at its mount, and a request finds its file, its .html, then the 404 page", async () => {
  const d = (await deploy(ada.caller, docs.id, pack({ "dist/index.html": "home", "dist/guide.html": "guide", "dist/404.html": "lost", "dist/app.js": "1" })))!;
  assert.equal(d.state, "live");
  assert.equal(d.files, 4);
  assert.equal((await siteFile(docs.slug, {}, "/"))?.status, 200);
  assert.match((await siteFile(docs.slug, {}, "/guide"))!.key, /guide\.html$/);
  assert.equal((await siteFile(docs.slug, {}, "/app.js"))?.contentType, "text/javascript; charset=utf-8");
  assert.equal((await siteFile(docs.slug, {}, "/nowhere"))?.status, 404);
});

test("a new deployment replaces the live one, which stays to restore", async () => {
  await deploy(ada.caller, docs.id, pack({ "index.html": "v2" }));
  const list = (await listDeployments(ada.caller, docs.id))!;
  assert.deepEqual(list.slice(0, 2).map((d) => d.state), ["live", "replaced"]);
});

test("what can't serve is refused, and a brand portal's root stays Artbucket's", async () => {
  await assert.rejects(deploy(ada.caller, docs.id, pack({ "page.html": "x" })), /No index\.html/);
  await assert.rejects(deploy(ada.caller, docs.id, text("not a zip")), /isn't a zip/);
  await assert.rejects(deploy(ada.caller, docs.id, pack({ "index.html": "x" }), { path: "/Docs" }), /path/);
  const logos = await createCollection(ada.caller, { name: "Logos" });
  const press = await createPortal(ada.caller, { name: "Press", slug: `press-${Date.now().toString(36)}`, collections: [logos.id] });
  await assert.rejects(deploy(ada.caller, press.id, pack({ "index.html": "x" }), { kind: "docs" }), /root is drawn by Artbucket/);
  // Beside it, at a path, a build answers there and the portal keeps the rest.
  await deploy(ada.caller, press.id, pack({ "index.html": "docs" }), { path: "/docs", kind: "docs" });
  assert.equal((await siteFile(press.slug, {}, "/docs"))?.status, 200);
  assert.equal(await siteFile(press.slug, {}, "/"), null);
});

test("a build whose manifest names a replaced asset fails, and says which", async () => {
  const png = (background: string) => sharp({ create: { width: 4, height: 4, channels: 3, background } }).png().toBuffer();
  const old = (await ingestBytes(ada.caller, { bytes: await png("#123456"), mime: "image/png", filename: "old-logo.png" })).asset;
  const now = (await ingestBytes(ada.caller, { bytes: await png("#654321"), mime: "image/png", filename: "logo.png" })).asset;
  await db.update(assets).set({ supersededBy: now.id }).where(eq(assets.id, old.id));
  await assert.rejects(deploy(ada.caller, docs.id, pack({ "index.html": "x", "artbucket.site.json": JSON.stringify({ assets: [old.id] }) })), /old-logo\.png was replaced/);
  assert.equal((await listDeployments(ada.caller, docs.id))![0].state, "failed");
  // The one live before is still what answers.
  assert.equal((await siteFile(docs.slug, {}, "/"))?.status, 200);
});

test("a live build's manifest is its lineage: the assets it names and its brand flow into the site", async () => {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#0a7f3c" } }).png().toBuffer();
  const mark = (await ingestBytes(ada.caller, { bytes: png, mime: "image/png", filename: "mark.png" })).asset;
  const site = await createPortal(ada.caller, { name: "Landing", slug: `landing-${Date.now().toString(36)}`, kind: "landing" });
  await deploy(ada.caller, site.id, pack({ "index.html": "hi", "artbucket.site.json": JSON.stringify({ brand: "default", assets: [mark.id] }) }));
  const l = (await lineage(ada.caller, mark.id, { depth: 1, direction: ["down"] }))!;
  assert.ok(l.edges.some((e) => e.to === site.id && e.kind === "built" && e.via === "/"));
  const b = (await lineage(ada.caller, `${ada.caller.project.organization.slug}/${ada.caller.project.slug}/brand/default`, { depth: 1, direction: ["down"] }))!;
  assert.ok(b.nodes.some((n) => n.id === site.id));
});
