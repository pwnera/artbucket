import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { signUp } from "@/test/db";
import { handleMcp } from "@/lib/mcp";
import { ingestBytes, proposeTags } from "@/lib/core/assets";
import type { Caller } from "@/lib/core/access";

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
