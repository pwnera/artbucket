import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { request, signUp } from "@/test/db";
import { parseQuery } from "@/lib/catalog";
import { callerFrom } from "@/lib/core/access";
import { ingestBytes } from "@/lib/core/assets";
import { searchCatalog } from "@/lib/core/catalog";
import { switchFeature } from "@/lib/core/features";
import { createProject } from "@/lib/core/people";
import { GET as file } from "@/app/a/[id]/[[...transform]]/route";

// A server's feature, as Intelligence is: off by default, each project deciding.
const dir = mkdtempSync(join(tmpdir(), "features-"));
process.env.FEATURES_FILE = join(dir, "features.json");
writeFileSync(process.env.FEATURES_FILE, JSON.stringify({ features: [{ id: "helper", name: "Helper", description: "Answers questions." }] }));

const ada = await signUp("Ada");
const a = ada.caller.project;
const b = await createProject(ada.caller, { name: "B" });
const c = await createProject(ada.caller, { name: "C" });
const headers = (project: string, feature?: string) => ({ cookie: `${ada.cookie}; ab_project=${project}`, ...(feature && { "artbucket-feature": feature }) });
const as = async (project: string, feature?: string) => (await callerFrom(request(headers(project, feature))))!;

let made = 0;
const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: made++, g: 0, b: 0 } } }).png().toBuffer();
const upload = async (project: string, filename: string) => (await ingestBytes(await as(project), { bytes: await png(), mime: "image/png", filename })).asset;
const posters = { a: await upload(a.id, "poster-a.png"), b: await upload(b.id, "poster-b.png"), c: await upload(c.id, "poster-c.png") };

// On in A and C, off in B.
await switchFeature(await as(a.id), "project", "helper", "on");
await switchFeature(await as(c.id), "project", "helper", "on");

const found = async (project: string, feature?: string) =>
  (await searchCatalog(await as(project, feature), parseQuery("poster type:asset"))).items.map((i) => i.name).sort();

test("for the feature, the catalog reaches every project where it is on, and none where it is off", async () => {
  assert.deepEqual(await found(a.id, "helper"), ["poster-a.png", "poster-c.png"]);
});

test("without it, the person reaches what they always did", async () => {
  assert.deepEqual(await found(a.id), ["poster-a.png", "poster-b.png", "poster-c.png"]);
});

test("for the feature, a project where it is off doesn't open at all", async () => {
  await assert.rejects(as(b.id, "helper"), (err: Error & { code?: string }) => err.code === "feature_off");
});

test("for the feature, a file of a project where it is off isn't served; without it, it is", async () => {
  const get = (id: string, feature?: string) => file(request(headers(a.id, feature), `/a/${id}`), { params: Promise.resolve({ id, transform: undefined }) });
  assert.equal((await get(posters.b.id, "helper")).status, 404);
  assert.equal((await get(posters.c.id, "helper")).status, 200);
  assert.equal((await get(posters.b.id)).status, 200);
});

test("a feature this server doesn't list is ignored: it narrows nothing", async () => {
  assert.deepEqual(await found(a.id, "nonesuch"), ["poster-a.png", "poster-b.png", "poster-c.png"]);
});

// Files served count their traffic after answering: let that land before the database goes.
test.after(() => new Promise((r) => setTimeout(r, 300)));
