import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { signUp } from "@/test/db";
import { db } from "@/lib/db";
import { assets, siteDeployments } from "@/lib/db/schema";
import { ingestBytes } from "@/lib/core/assets";
import { createCollection } from "@/lib/core/collections";
import { createPortal, updatePortal } from "@/lib/core/portals";
import { checkBuild, deploy, KEEP_REPLACED, listDeployments, recheckSites, restoreDeployment, siteFile, unlockValue } from "@/lib/core/sites";
import { usageOf } from "@/lib/core/usage";
import { lineage } from "@/lib/core/catalog";
import { zip } from "@/lib/zip";

const ada = await signUp("Sitesada");
const text = (s: string) => new TextEncoder().encode(s);
const pack = (files: Record<string, string>) => zip(Object.entries(files).map(([name, s]) => ({ name, data: text(s) })));
const docs = await createPortal(ada.caller, { name: "Docs", slug: `docs-${Date.now().toString(36)}`, kind: "docs" });

test("a zip goes live at its mount, and a request finds its file, its .html, then the 404 page", async () => {
  const d = (await deploy(ada.caller, docs.id, pack({ "dist/index.html": "home", "dist/guide.html": "guide", "dist/start/index.html": "start", "dist/404.html": "lost", "dist/app.js": "1" })))!;
  assert.equal(d.state, "live");
  assert.equal(d.files, 5);
  assert.equal((await siteFile(docs.slug, {}, "/"))?.status, 200);
  const file = async (rest: string) => {
    const f = await siteFile(docs.slug, {}, rest);
    return f && !("slash" in f) ? f : null;
  };
  assert.match((await file("/guide"))!.key, /guide\.html$/);
  // A folder keeps its slash, so its page's relative links resolve under it.
  assert.deepEqual(await siteFile(docs.slug, {}, "/start"), { slash: true });
  assert.match((await file("/start/"))!.key, /start\/index\.html$/);
  assert.equal((await file("/app.js"))?.contentType, "text/javascript; charset=utf-8");
  assert.equal((await siteFile(docs.slug, {}, "/nowhere"))?.status, 404);
});

test("a new deployment replaces the live one, which stays to restore", async () => {
  await deploy(ada.caller, docs.id, pack({ "index.html": "v2" }));
  const list = (await listDeployments(ada.caller, docs.id))!;
  assert.deepEqual(list.slice(0, 2).map((d) => d.state), ["live", "replaced"]);
  // Restored, the one before is live again and the new one replaced.
  assert.equal((await restoreDeployment(ada.caller, docs.id, list[1].id))?.state, "live");
  assert.deepEqual((await listDeployments(ada.caller, docs.id))!.slice(0, 2).map((d) => d.state), ["replaced", "live"]);
  await restoreDeployment(ada.caller, docs.id, list[0].id);
});

test("a password site's builds open with the door's cookie, until the password changes", async () => {
  const shut = await createPortal(ada.caller, { name: "Shut", slug: `shut-${Date.now().toString(36)}`, kind: "docs", access: "password", password: "open sesame 1" });
  await deploy(ada.caller, shut.id, pack({ "index.html": "secret" }));
  await assert.rejects(siteFile(shut.slug, {}, "/"), /needs a password/);
  const cookie = await unlockValue(shut.slug);
  assert.equal((await siteFile(shut.slug, {}, "/", cookie))?.status, 200);
  await assert.rejects(siteFile(shut.slug, {}, "/", "123.forged"), /needs a password/);
  await updatePortal(ada.caller, shut.id, { password: "open sesame 2" });
  await assert.rejects(siteFile(shut.slug, {}, "/", cookie), /needs a password/);
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
  assert.deepEqual(await siteFile(press.slug, {}, "/docs"), { slash: true });
  assert.equal((await siteFile(press.slug, {}, "/docs/"))?.status, 200);
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

test("builds count as storage, and only a few replaced are kept per path", async () => {
  const site = await createPortal(ada.caller, { name: "Many", slug: `many-${Date.now().toString(36)}`, kind: "docs" });
  const before = (await usageOf(ada.caller)).used.storage;
  for (let i = 0; i < KEEP_REPLACED + 3; i++) await deploy(ada.caller, site.id, pack({ "index.html": "x".repeat(1000) }));
  const list = (await listDeployments(ada.caller, site.id))!;
  assert.deepEqual(list.map((d) => d.state), ["live", ...Array(KEEP_REPLACED).fill("replaced")]);
  assert.equal((await usageOf(ada.caller)).used.storage - before, (KEEP_REPLACED + 1) * 1000);
});

test("every file is matched against the library: a copy or a pinned link of a replaced or expired asset fails, with no manifest", async () => {
  const png = (background: string) => sharp({ create: { width: 4, height: 4, channels: 3, background } }).png().toBuffer();
  const oldBytes = await png("#a1b2c3");
  const old = (await ingestBytes(ada.caller, { bytes: oldBytes, mime: "image/png", filename: "logo-2024.png" })).asset;
  const now = (await ingestBytes(ada.caller, { bytes: await png("#c3b2a1"), mime: "image/png", filename: "logo-2026.png" })).asset;
  await db.update(assets).set({ supersededBy: now.id }).where(eq(assets.id, old.id));
  const site = await createPortal(ada.caller, { name: "Scanned", slug: `scanned-${Date.now().toString(36)}`, kind: "landing" });
  const files = (extra: Record<string, Uint8Array | string>) =>
    zip(Object.entries({ "index.html": "<h1>hi</h1>", ...extra }).map(([name, d]) => ({ name, data: typeof d === "string" ? text(d) : d })));

  // A copied file: refused, naming the file and what replaced it.
  await assert.rejects(deploy(ada.caller, site.id, files({ "img/logo.png": oldBytes })), (e: Error) => /logo-2024\.png was replaced by logo-2026\.png/.test(e.message) && /img\/logo\.png is a copy of it/.test(e.message) && e.message.includes(now.id));
  // A pinned link to the old version: refused too.
  await assert.rejects(deploy(ada.caller, site.id, files({ "index.html": `<img src="/a/${old.id}/w_200">` })), /index\.html links it/);
  // An expired license, through a link.
  const photo = (await ingestBytes(ada.caller, { bytes: await png("#0f0f0f"), mime: "image/png", filename: "photo.png" })).asset;
  await db.update(assets).set({ rights: { license: "RM", territories: [], channels: [], embargo: null, expires: "2020-01-01", modelRelease: null } }).where(eq(assets.id, photo.id));
  await assert.rejects(deploy(ada.caller, site.id, files({ "about.html": `<img src="https://app.example.com/a/${photo.id}">` })), /photo\.png can't be used: License expired after 2020-01-01: about\.html links it/);

  // /c/ follows the stack, so the old id there shows the new logo: live, and its lineage is the version it serves.
  const d = (await deploy(ada.caller, site.id, files({ "index.html": `<img src="/c/${old.id}">`, "css/site.css": "body{}" })))!;
  assert.equal(d.state, "live");
  assert.deepEqual(d.uses, [{ asset: now.id, how: "current", file: "index.html" }]);
  const l = (await lineage(ada.caller, now.id, { depth: 1, direction: ["down"] }))!;
  assert.ok(l.edges.some((e) => e.to === site.id && e.kind === "built"));

  // A copy of what may be used goes live, and is lineage too.
  const ok = (await deploy(ada.caller, site.id, files({ "logo.png": await png("#c3b2a1") })))!;
  assert.deepEqual(ok.uses, [{ asset: now.id, how: "copy", file: "logo.png" }]);
});

test("an address of an asset that isn't the project's is left alone", async () => {
  const site = await createPortal(ada.caller, { name: "Elsewhere", slug: `elsewhere-${Date.now().toString(36)}`, kind: "docs" });
  const d = (await deploy(ada.caller, site.id, pack({ "index.html": `<img src="https://other.example/a/0b6c2f0e-6a52-4a5e-9d3b-1f1a2c3d4e5f">` })))!;
  assert.equal(d.state, "live");
  assert.deepEqual(d.uses, []);
});

test("live builds are checked again: a license that ended since shows on the deployment, and clears once fixed", async () => {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#5a5a10" } }).png().toBuffer();
  const photo = (await ingestBytes(ada.caller, { bytes: png, mime: "image/png", filename: "campaign.png" })).asset;
  const rights = (expires: string) => ({ license: "RM", territories: [], channels: [], embargo: null, expires, modelRelease: null });
  await db.update(assets).set({ rights: rights("2099-01-01") }).where(eq(assets.id, photo.id));
  const site = await createPortal(ada.caller, { name: "Campaign", slug: `campaign-${Date.now().toString(36)}`, kind: "landing" });
  const d = (await deploy(ada.caller, site.id, pack({ "index.html": `<img src="/a/${photo.id}/w_800">` })))!;
  assert.deepEqual(d.problems, []);

  // The license ends; the next re-check of a build due for one says so, and the build stays live.
  await db.update(assets).set({ rights: rights("2026-01-01") }).where(eq(assets.id, photo.id));
  await db.update(siteDeployments).set({ checkedAt: null }).where(eq(siteDeployments.id, d.id));
  const run = await recheckSites("2026-06-01");
  assert.ok(run.checked >= 1 && run.troubled >= 1);
  const [after] = (await listDeployments(ada.caller, site.id))!;
  assert.equal(after.state, "live");
  assert.deepEqual(after.problems, ["campaign.png can't be used: License expired after 2026-01-01: index.html links it"]);

  // Renewed, the next re-check clears it; one checked lately waits its turn.
  await db.update(assets).set({ rights: rights("2099-01-01") }).where(eq(assets.id, photo.id));
  await recheckSites("2026-06-01");
  assert.equal((await listDeployments(ada.caller, site.id))![0].problems.length, 1);
  await db.update(siteDeployments).set({ checkedAt: null }).where(eq(siteDeployments.id, d.id));
  await recheckSites("2026-06-01");
  assert.deepEqual((await listDeployments(ada.caller, site.id))![0].problems, []);
});

test("a build hosted elsewhere is checked the same way, and nothing is stored", async () => {
  const png = (background: string) => sharp({ create: { width: 4, height: 4, channels: 3, background } }).png().toBuffer();
  const oldBytes = await png("#2b3c4d");
  const old = (await ingestBytes(ada.caller, { bytes: oldBytes, mime: "image/png", filename: "badge-v1.png" })).asset;
  const now = (await ingestBytes(ada.caller, { bytes: await png("#4d3c2b"), mime: "image/png", filename: "badge-v2.png" })).asset;
  await db.update(assets).set({ supersededBy: now.id }).where(eq(assets.id, old.id));
  const files = (f: Record<string, Uint8Array | string>) => zip(Object.entries(f).map(([name, d]) => ({ name, data: typeof d === "string" ? text(d) : d })));
  const before = (await usageOf(ada.caller)).used.storage;

  const refused = await checkBuild(ada.caller, files({ "out/docs/img/badge.png": oldBytes, "out/docs/page.html": "no index needed" }));
  assert.equal(refused.allowed, false);
  assert.equal(refused.files, 2);
  assert.match(refused.problems[0], /badge-v1\.png was replaced by badge-v2\.png .*docs\/img\/badge\.png is a copy of it/);

  const fine = await checkBuild(ada.caller, files({ "index.html": `<img src="/c/${old.id}">` }));
  assert.deepEqual(fine, { allowed: true, files: 1, uses: [{ asset: now.id, how: "current", file: "index.html" }], problems: [] });
  await assert.rejects(checkBuild(ada.caller, files({ "artbucket.site.json": "{not json" })), /isn't JSON/);
  assert.equal((await usageOf(ada.caller)).used.storage, before);
});
