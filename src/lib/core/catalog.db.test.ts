import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { request, signUp } from "@/test/db";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { parseQuery } from "@/lib/catalog";
import { callerFrom } from "@/lib/core/access";
import { ingestBytes } from "@/lib/core/assets";
import { createBrand, createRule, publishBrand } from "@/lib/core/brand";
import { describeObject, lineage, searchCatalog, whoCan } from "@/lib/core/catalog";
import { createCollection } from "@/lib/core/collections";
import { acceptInvitation, createInvitation, createWorkspace } from "@/lib/core/people";
import { createPortal } from "@/lib/core/portals";

const ada = await signUp("Ada");
const grace = await signUp("Grace");
const org = ada.caller.workspace.organization.slug;
const corporate = ada.caller.workspace;

let made = 0;
const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: made++, g: 0, b: 0 } } }).png().toBuffer();
const upload = async (filename: string, extra: { collections?: string[]; private?: boolean } = {}, caller = ada.caller) =>
  (await ingestBytes(caller, { bytes: await png(), mime: "image/png", filename, ...extra })).asset;

// Corporate: a logo in Logos, named by the Acme brand's logo rule; Logos and Acme on the press portal.
const logos = await createCollection(ada.caller, { name: "Logos" });
const logo = await upload("logo-primary.svg.png", { collections: [logos.id] });
const old = await upload("logo-primary.png");
await db.update(assets).set({ supersededBy: logo.id }).where(eq(assets.id, old.id));
await createBrand(ada.caller, { name: "Acme", slug: "acme" });
await createRule(ada.caller, "acme", { key: "logo.primary", type: "text", value: "The primary logo", assets: [{ id: logo.id, rendition: null }] });
await publishBrand(ada.caller, "acme", { note: "First" });
await createPortal(ada.caller, { name: "Press", slug: `press-${Date.now().toString(36)}`, access: "public", collections: [logos.id], brands: ["acme"] });
// Private: a collection only its grants reach, and an asset in it.
const secret = await createCollection(ada.caller, { name: "Board", private: true });
const deck = await upload("board-logo-deck.png", { collections: [secret.id] });
await createRule(ada.caller, "acme", { key: "logo.board", type: "text", value: "Board", assets: [{ id: deck.id, rendition: null }] });

// A second project, and a person who can read Corporate only.
const q4 = await createWorkspace(ada.caller, { name: "Q4 Campaign" });
const sam = await signUp("Sam");
const { url } = await createInvitation(ada.caller, { email: sam.user.email, resource: "workspace", resourceId: corporate.id, scope: "read" });
await acceptInvitation(url.split("/invite/")[1], { ...sam.user, ip: null });
const samHere = (await callerFrom(request({ cookie: `${sam.cookie}; ab_workspace=${corporate.id}` })))!;

test("one search finds every type, grouped and counted, in every project the caller reaches", async () => {
  const r = await searchCatalog(ada.caller, parseQuery("logo"));
  assert.ok(r.counts.asset && r.counts.asset >= 1);
  assert.equal(r.counts.rule, 2);
  const types = new Set(r.items.map((i) => i.type));
  assert.ok(types.has("asset") && types.has("rule"));
  const rule = r.items.find((i) => i.type === "rule" && i.slug === "logo.primary")!;
  assert.equal(rule.address, `${org}/${corporate.slug}/brand/acme/rule/logo.primary`);
  assert.equal(rule.parent?.name, "Acme");
});

test("a replaced asset is left out by default, and the results say so", async () => {
  const r = await searchCatalog(ada.caller, parseQuery("logo type:asset"));
  assert.ok(!r.items.some((i) => i.id === old.id));
  assert.equal(r.hidden.count, 1);
  assert.match(r.hidden.example!, /logo-primary\.png matches too, but it was replaced by logo-primary\.svg\.png/);
  const all = await searchCatalog(ada.caller, parseQuery("logo type:asset status:replaced"));
  assert.deepEqual(all.items.map((i) => i.id), [old.id]);
});

test("only what the caller reaches is returned or counted: another organization finds nothing", async () => {
  const r = await searchCatalog(grace.caller, parseQuery("logo"));
  assert.equal(r.total, 0);
  assert.equal(await describeObject(grace.caller, logo.id), null);
});

test("a private collection's assets are out of a reader's search and counts", async () => {
  const r = await searchCatalog(samHere, parseQuery("deck"));
  assert.equal(r.total, 0);
  const mine = await searchCatalog(ada.caller, parseQuery("deck"));
  assert.equal(mine.counts.asset, 1);
});

test("uses: finds what is downstream of an address", async () => {
  const r = await searchCatalog(ada.caller, parseQuery(`uses:${org}/${corporate.slug}/collection/logos`));
  assert.deepEqual(r.items.map((i) => i.type), ["portal"]);
});

test("an address resolves to its object, and describe names what uses it", async () => {
  const d = await describeObject(ada.caller, `${org}/${corporate.slug}/asset/logo-primary-svg`);
  assert.equal(d?.id, logo.id);
  assert.deepEqual(d!.usedBy.map((u) => u.type).sort(), ["brand", "collection"]);
  assert.equal(d!.usedByCount, 2);
  assert.match(d!.open, new RegExp(`/assets/${logo.id}\\?workspace=${corporate.id}`));
});

test("lineage shows one hop each way, with how far each node goes on, and the impact line", async () => {
  const l = (await lineage(ada.caller, logo.id, { depth: 1 }))!;
  const names = l.nodes.map((n) => n.name).sort();
  assert.deepEqual(names, ["Acme", "Logos", "logo-primary.png", "logo-primary.svg.png"].sort());
  const acme = l.nodes.find((n) => n.name === "Acme")!;
  assert.equal(acme.down, 1, "Acme goes on to the portal");
  assert.equal(l.edges.find((e) => e.to === acme.id)?.via, "logo.primary");
  assert.match(l.impact.line, /Changing logo-primary\.svg\.png reaches 3 things downstream, in 1 project\./);
});

test("lineage stops at what the caller can't see, and counts it", async () => {
  const l = (await lineage(samHere, `${org}/${corporate.slug}/brand/acme`, { depth: 1, direction: ["up"] }))!;
  assert.ok(!l.nodes.some((n) => n.id === deck.id));
  assert.equal(l.unseen, 1);
});

test("who can reach it: each person's role and the grant it comes through, then the delivery door", async () => {
  const w = (await whoCan(ada.caller, logo.id))!;
  const sam_ = w.holders.find((h) => h.who === "Sam")!;
  assert.equal(sam_.role, "Viewer");
  assert.equal(sam_.via, `Project ${corporate.name}`);
  assert.equal(w.holders.find((h) => h.who === "Ada")?.role, "Admin");
  // The private deck: Sam's project role doesn't reach it.
  const d = (await whoCan(ada.caller, deck.id))!;
  assert.ok(!d.holders.some((h) => h.who === "Sam"));
});

test("the catalog spans the organization's projects: Q4 is there for its admin", async () => {
  await upload("q4-hero.png", {}, (await callerFrom(request({ cookie: `${ada.cookie}; ab_workspace=${q4.id}` })))!);
  const r = await searchCatalog(ada.caller, parseQuery("hero"));
  assert.deepEqual(r.projects.map((p) => p.name), ["Q4 Campaign"]);
});
