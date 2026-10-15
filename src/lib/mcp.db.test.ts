import assert from "node:assert/strict";
import { mock, test } from "node:test";
import sharp from "sharp";
import { signUp } from "@/test/db";
import { handleMcp } from "@/lib/mcp";
import { ingestBytes, proposeTags } from "@/lib/core/assets";
import type { Caller } from "@/lib/core/access";
import { updateSetting } from "@/lib/core/settings";

const ada = await signUp("Ada");

let made = 0;
const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: made++, g: 1, b: 2 } } }).png().toBuffer();
const upload = async (filename: string) => (await ingestBytes(ada.caller, { bytes: await png(), mime: "image/png", filename })).asset;

/** A tools/call as the assistant makes it: what the tool answered, or its error. */
/** `error` is set only when the tool refused. */
type Out = Record<string, unknown> & { error: string };

async function call(name: string, args: Record<string, unknown> = {}, caller: Caller = ada.caller): Promise<Out> {
  const res = (await handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, caller)) as {
    result?: { structuredContent?: Record<string, unknown>; content: { text: string }[]; isError?: boolean };
    error?: { message: string };
  };
  if (res.error) throw new Error(res.error.message);
  if (res.result!.isError) return { error: JSON.parse(res.result!.content[0].text).error as string };
  return res.result!.structuredContent as Out;
}

test("the new tools are listed, reads marked read-only and delete destructive", async () => {
  const res = (await handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ada.caller)) as {
    result: { tools: { name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean } }[] };
  };
  const by = new Map(res.result.tools.map((t) => [t.name, t.annotations]));
  for (const read of ["get_activity", "get_insights", "asset_versions", "brand_tokens", "list_members", "list_projects", "shared_with_us", "object_activity"]) {
    assert.equal(by.get(read)?.readOnlyHint, true, read);
  }
  for (const write of ["update_asset", "update_assets", "review_assets", "restore_asset", "create_share", "save_search", "make_version_current"]) {
    assert.equal(by.get(write)?.readOnlyHint, false, write);
  }
  assert.equal(by.get("delete_asset")?.destructiveHint, true);
});

test("update_asset renames, credits and retags; tags and addTags together are refused", async () => {
  const a = await upload("IMG_0042.png");
  const out = await call("update_asset", { id: a.id, title: "Harbour at dawn", creator: "Lena Ortiz", addTags: ["Harbour", "dawn"] });
  assert.equal(out.title, "Harbour at dawn");
  assert.equal(out.creator, "Lena Ortiz");
  assert.deepEqual(out.tags, ["harbour", "dawn"]);
  const less = await call("update_asset", { id: a.id, removeTags: ["dawn"] });
  assert.deepEqual(less.tags, ["harbour"]);
  assert.match((await call("update_asset", { id: a.id, tags: ["x"], addTags: ["y"] })).error, /not both/);
  assert.match((await call("update_asset", { id: a.id })).error, /Nothing to change/);
});

test("update_assets retags many, and one that fails leaves the others done", async () => {
  const [a, b] = [await upload("a.png"), await upload("b.png")];
  const gone = "00000000-0000-4000-8000-000000000000";
  const out = (await call("update_assets", { ids: [a.id, gone, b.id], addTags: ["autumn"] })) as unknown as { done: { id: string; tags: string[] }[]; failed: { id: string }[] };
  assert.deepEqual(out.done.map((d) => d.id), [a.id, b.id]);
  assert.ok(out.done.every((d) => d.tags.includes("autumn")));
  assert.deepEqual(out.failed.map((f) => f.id), [gone]);
});

test("review_assets takes every suggestion with \"all\", asset by asset", async () => {
  const [a, b] = [await upload("latte.png"), await upload("mocha.png")];
  // Suggested by a tagger, as Intelligence does: whoever proposed them can't be the one to accept them.
  const tagger = { ...ada.caller, actor: "Tagger" };
  await proposeTags(tagger, a.id, ["coffee", "latte"]);
  await proposeTags(tagger, b.id, ["coffee", "mocha"]);
  // Reviewing, the search carries the suggestions, so nothing has to be described one by one.
  const waiting = (await call("search_assets", { review: true })) as unknown as { results: { id: string; proposedTags: string[] }[] };
  assert.deepEqual(waiting.results.find((r) => r.id === a.id)?.proposedTags, ["coffee", "latte"]);
  const out = (await call("review_assets", { reviews: [{ id: a.id, acceptTags: "all" }, { id: b.id, acceptTags: ["mocha"], dismissTags: "all" }] })) as unknown as {
    done: { id: string; tags: string[]; proposedTags: string[] }[];
    failed: unknown[];
  };
  assert.deepEqual(out.failed, []);
  assert.deepEqual(out.done[0].tags, ["coffee", "latte"]);
  assert.deepEqual(out.done[1].proposedTags, []);
});

test("delete_asset says what used it and until when it comes back; restore_asset brings it back", async () => {
  const logo = await upload("logo.png");
  assert.equal((await call("set_rules", { set: [{ key: "logo", type: "text", value: "Primary logo", assets: [logo.id] }] })).error, undefined);
  const out = await call("delete_asset", { id: logo.id });
  assert.equal(out.deleted, true);
  assert.match(String(out.restoreUntil), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok((out.usedBy as unknown as { type: string }[]).some((u) => u.type === "brand" || u.type === "rule"), JSON.stringify(out.usedBy));
  const deleted = (await call("search_assets", { status: ["deleted"] })) as unknown as { results: { id: string }[] };
  assert.ok(deleted.results.some((r) => r.id === logo.id));
  const back = await call("restore_asset", { id: logo.id });
  assert.equal(back.state, "active");
});

test("search_assets finds by upload date, licenses running out, untagged, and pages with offset", async () => {
  const soon = await upload("soon.png");
  await call("update_asset", { id: soon.id, rights: { expires: "2099-01-15" }, tags: ["x"] });
  const later = await upload("later.png");
  await call("update_asset", { id: later.id, rights: { expires: "2099-06-01" } });
  const ids = async (args: Record<string, unknown>) => ((await call("search_assets", { limit: 50, ...args })) as unknown as { results: { id: string }[] }).results.map((r) => r.id);
  assert.deepEqual(await ids({ expiresBefore: "2099-02-01" }), [soon.id]);
  assert.ok((await ids({ untagged: true })).includes(later.id));
  assert.ok(!(await ids({ untagged: true })).includes(soon.id));
  assert.deepEqual(await ids({ uploadedSince: "2999-01-01" }), []);
  assert.ok((await ids({ uploadedSince: new Date(Date.now() - 60_000).toISOString() })).includes(later.id));
  const [first] = await ids({ limit: 1 });
  const [second] = await ids({ limit: 1, offset: 1 });
  assert.notEqual(first, second);
  assert.match((await call("search_assets", { expiresBefore: "next week" })).error, /expiresBefore/);
});

test("the reads answer: activity, versions, tokens, members without invitation links, projects, searches", async () => {
  const a = await upload("v.png");
  const activity = (await call("get_activity", { limit: 5 })) as unknown as { data: unknown[] };
  assert.ok(activity.data.length > 0);
  const versions = (await call("asset_versions", { id: a.id })) as unknown as { versions: { id: string; current: boolean }[] };
  assert.equal(versions.versions[0].id, a.id);
  assert.equal((await call("set_rules", { set: [{ key: "primary", type: "color", value: "#1F4E3D" }] })).error, undefined);
  const tokens = await call("brand_tokens", {});
  assert.match(String(tokens.tokens), /#1F4E3D/i);
  const members = await call("list_members", {});
  assert.ok(!JSON.stringify(members).includes("/invite/"));
  const projects = (await call("list_projects")) as unknown as { projects: { slug: string }[] };
  assert.equal(projects.projects[0].slug, ada.caller.project.slug);
  await call("save_search", { name: "Running out", query: "expiresBefore=2099-02-01" });
  const saved = (await call("list_searches")) as unknown as { searches: { name: string }[] };
  assert.ok(saved.searches.some((s) => s.name === "Running out"));
  assert.ok(Array.isArray((await call("object_activity", { object: a.id })).activity));
  assert.deepEqual((await call("shared_with_us")).shared, []);
});

test("create_share makes an upload link into a collection named by name, with a password", async () => {
  await call("create_collection", { name: "Agency drop" });
  const out = (await call("create_share", { kind: "upload", collection: "agency drop", password: "s3cret!", expiresAt: "2099-01-01T00:00:00Z" })) as unknown as {
    share: { url: string; kind: string };
  };
  assert.equal(out.share.kind, "upload");
  assert.match(out.share.url, /^https?:\/\//);
  const list = (await call("list_shares")) as unknown as { shares: unknown[] };
  assert.equal(list.shares.length, 1);
});

test("an agent checks a site it built and deploys it, files as text and base64; a replaced logo is refused, naming it", async () => {
  const old = await upload("logo-old.png");
  const bytes = await png();
  const now = (await ingestBytes(ada.caller, { bytes, mime: "image/png", filename: "logo-new.png" })).asset;
  const { db } = await import("@/lib/db");
  const { assets } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  await db.update(assets).set({ supersededBy: now.id }).where(eq(assets.id, old.id));
  const site = await call("create_site", { name: "Agent docs", kind: "docs", access: "public" });
  const index = { path: "index.html", content: `<h1>Docs</h1><img src="/a/${old.id}">` };

  const refused = await call("check_site", { files: [index] });
  assert.equal(refused.allowed, false);
  assert.match((refused.problems as string[])[0], /logo-old\.png was replaced by logo-new\.png .*index\.html links it/);
  assert.match((await call("deploy_site", { address: site.slug, files: [index] })).error, /logo-old\.png was replaced/);

  const fixed = [{ path: "index.html", content: "<h1>Docs</h1><img src=\"logo.png\">" }, { path: "logo.png", content: bytes.toString("base64"), base64: true }];
  assert.equal((await call("check_site", { files: fixed })).allowed, true);
  const live = await call("deploy_site", { address: site.slug, files: fixed });
  assert.equal(live.state, "live");
  assert.deepEqual(live.uses, [{ asset: now.id, how: "copy", file: "logo.png" }]);
  assert.match(live.url as string, /\/$/);
});

test("Fixes, automations, deployments and projects: reads are read-only, deletes destructive", async () => {
  const res = (await handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ada.caller)) as {
    result: { tools: { name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean } }[] };
  };
  const by = new Map(res.result.tools.map((t) => [t.name, t.annotations]));
  for (const read of ["get_fixes", "list_automations", "automation_runs", "list_deployments"]) assert.equal(by.get(read)?.readOnlyHint, true, read);
  for (const write of ["create_automation", "update_automation", "test_automation", "restore_deployment", "create_project", "rename_project"]) {
    assert.equal(by.get(write)?.readOnlyHint, false, write);
  }
  assert.equal(by.get("delete_automation")?.destructiveHint, true);
  assert.ok(!by.has("delete_project"), "a project is never deleted over MCP");
});

test("get_fixes answers as the Fixes page: what is open, and each list", async () => {
  const out = await call("get_fixes");
  assert.equal(typeof out.open, "number");
  for (const k of ["stale", "gaps", "licenses"]) assert.ok(Array.isArray(out[k]), k);
});

test("an agent makes, tests, changes and deletes an automation; recipes come with the list; a webhook's secret once", async () => {
  mock.method(console, "info", () => {});
  await updateSetting(ada.caller, "organization", "email", { enabled: true, provider: "console", from: "Test <test@example.com>" });
  const mail = await call("create_automation", { name: "Licenses to legal", trigger: "asset.expiring", days: 30, action: "email", emails: ["legal@example.com"] });
  assert.equal(mail.trigger, "asset.expiring");
  assert.ok(!("secret" in mail));
  const listed = await call("list_automations");
  assert.ok((listed.automations as { id: string }[]).some((a) => a.id === mail.id));
  assert.ok((listed.recipes as { id: string }[]).some((r) => r.id === "licenses-to-legal"));

  assert.equal((await call("update_automation", { id: mail.id, enabled: false })).enabled, false);
  // A test goes out on or off, once, and lands in the run log marked as one.
  await upload("photo.png");
  const sent = await call("test_automation", { id: mail.id });
  assert.equal(sent.test, true);
  const { runs } = (await call("automation_runs", { id: mail.id })) as unknown as { runs: { id: string; test: boolean }[] };
  assert.deepEqual(runs.map((r) => [r.id, r.test]), [[sent.id, true]]);

  const hook = await call("create_automation", { name: "Releases to Slack", trigger: "brand.released", action: "webhook", format: "slack", url: "https://hooks.example.com/services/T0/B0/x" });
  assert.match(hook.secret as string, /^whsec_/);
  assert.equal(hook.host, "hooks.example.com");
  assert.ok(!JSON.stringify(await call("list_automations")).includes("whsec_"));
  assert.match((await call("create_automation", { name: "No one", trigger: "asset.expiring", days: 1, action: "email" })).error, /emails/);

  assert.deepEqual(await call("delete_automation", { id: mail.id }), { deleted: true });
  assert.match((await call("automation_runs", { id: mail.id })).error, /No such automation/);
});

test("an agent rolls a site back: list_deployments, then restore_deployment puts the replaced one live", async () => {
  const site = await call("create_site", { name: "Rollback docs", kind: "docs", access: "public" });
  const first = await call("deploy_site", { address: site.slug, files: [{ path: "index.html", content: "<h1>One</h1>" }] });
  const second = await call("deploy_site", { address: site.slug, files: [{ path: "index.html", content: "<h1>Two</h1>" }] });
  const before = (await call("list_deployments", { address: site.slug })).deployments as { id: string; state: string }[];
  assert.deepEqual(before.map((d) => [d.id, d.state]), [[second.id, "live"], [first.id, "replaced"]]);

  assert.equal((await call("restore_deployment", { address: site.slug, deployment: first.id })).state, "live");
  const after = (await call("list_deployments", { address: site.slug })).deployments as { id: string; state: string }[];
  assert.deepEqual(after.map((d) => [d.id, d.state]), [[second.id, "replaced"], [first.id, "live"]]);
  assert.match((await call("restore_deployment", { address: site.slug, deployment: "00000000-0000-4000-8000-000000000000" })).error, /No deployment/);
});

test("an organization admin makes a project and renames it; one not here is refused", async () => {
  const made = await call("create_project", { name: "Retail EMEA" });
  assert.equal(made.name, "Retail EMEA");
  const renamed = await call("rename_project", { id: made.id, name: "Retail Europe" });
  assert.deepEqual([renamed.id, renamed.name], [made.id, "Retail Europe"]);
  assert.match((await call("rename_project", { id: "00000000-0000-4000-8000-000000000000", name: "X" })).error, /No project/);
});
