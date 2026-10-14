import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { signUp } from "@/test/db";
import { db } from "@/lib/db";
import { assets, events } from "@/lib/db/schema";
import { ingestBytes } from "@/lib/core/assets";
import { insightsOf, notifyStale } from "@/lib/core/insights";
import { updateSetting } from "@/lib/core/settings";
import { createShare } from "@/lib/core/shares";

// The console provider prints each message: not in the test's output.
mock.method(console, "info", () => {});

const ada = await signUp("Ada");
await updateSetting(ada.caller, "organization", "email", { enabled: true, provider: "console", from: "Test <test@example.com>" });

let made = 0;
const upload = async (filename: string) => {
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: made++, g: 0, b: 0 } } }).png().toBuffer();
  return (await ingestBytes(ada.caller, { bytes, mime: "image/png", filename })).asset;
};
const old = await upload("logo-2025.png");
const now = await upload("logo-2026.png");
await db.update(assets).set({ supersededBy: now.id }).where(eq(assets.id, old.id));
const ws = ada.caller.project.id;

test("a place is told about a version once, and Insights says when", async () => {
  await db.insert(events).values({ projectId: ws, kind: "fetch", surface: "public", actor: "anonymous", assetId: old.id, verdict: "superseded", referrer: "shop.example.com" });
  const sent = await notifyStale(ada.caller, { referrer: "shop.example.com", assets: [old.id], emails: ["web@example.com"] });
  assert.equal(sent.emailed, 1);
  assert.deepEqual(sent.notified.map((n) => n.asset), [old.id]);

  const again = notifyStale(ada.caller, { referrer: "shop.example.com", assets: [old.id], emails: ["web@example.com"] });
  await assert.rejects(again, { code: "conflict" });

  const [row] = (await insightsOf(ada.caller)).stale;
  assert.equal(row.asset.id, old.id);
  assert.equal(row.owners, 0);
  assert.equal(row.notified?.by, "Ada");

  // Another place is its own.
  assert.equal((await notifyStale(ada.caller, { referrer: "blog.example.com", assets: [old.id], emails: ["blog@example.com"] })).emailed, 1);
});

test("nobody to tell, or nothing replaced, is refused and remembers nothing", async () => {
  await assert.rejects(notifyStale(ada.caller, { referrer: "elsewhere.example.com", assets: [old.id] }), { code: "invalid" });
  await assert.rejects(notifyStale(ada.caller, { referrer: "elsewhere.example.com", assets: [now.id], emails: ["a@example.com"] }), { code: "invalid" });
  // Not taken by the refusals above: it can still be told.
  assert.equal((await notifyStale(ada.caller, { referrer: "elsewhere.example.com", assets: [old.id], emails: ["a@example.com"] })).emailed, 1);
});

test("a search gap is requested by an upload link named after its words", async () => {
  await db.insert(events).values({ projectId: ws, kind: "search", surface: "app", actor: "person", subject: "dark logo", verdict: "empty" });
  assert.equal((await insightsOf(ada.caller)).gaps.find((g) => g.q === "dark logo")?.requested, null);
  await createShare(ada.caller, { kind: "upload", name: "Dark logo" });
  assert.equal((await insightsOf(ada.caller)).gaps.find((g) => g.q === "dark logo")?.requested?.by, "Ada");
});
