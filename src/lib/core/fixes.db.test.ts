import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mock, test } from "node:test";
import { eq } from "drizzle-orm";
import { signUp } from "@/test/db";
import { db } from "@/lib/db";
import { assets, events } from "@/lib/db/schema";
import { fixesOf } from "@/lib/core/fixes";
import { notifyStale } from "@/lib/core/insights";
import { updateSetting } from "@/lib/core/settings";
import { createShare } from "@/lib/core/shares";

// The console provider prints each message: not in the test's output.
mock.method(console, "info", () => {});

const ada = await signUp("Fixer");
await updateSetting(ada.caller, "organization", "email", { enabled: true, provider: "console", from: "Test <test@example.com>" });
const ws = ada.caller.project.id;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const asset = (filename: string, expires: string | null = null) =>
  db
    .insert(assets)
    .values({
      projectId: ws,
      sha256: randomBytes(32).toString("hex"),
      filename,
      mime: "image/png",
      size: 1,
      ...(expires && { rights: { license: "RM", territories: [], channels: [], embargo: null, expires, modelRelease: null } }),
    })
    .returning()
    .then((r) => r[0]);

test("one list of what to do, each thing done once it is: told, requested or replaced", async () => {
  assert.deepEqual(await fixesOf(ada.caller).then((f) => [f.open, f.stale.length, f.gaps.length, f.licenses.length]), [0, 0, 0, 0]);

  const old = await asset("logo-2025.png");
  const now = await asset("logo-2026.png");
  await db.update(assets).set({ supersededBy: now.id }).where(eq(assets.id, old.id));
  await db.insert(events).values([
    { projectId: ws, kind: "fetch", surface: "public", actor: "anonymous", assetId: old.id, verdict: "superseded", referrer: "shop.example.com" },
    // A fetch that named no place has nobody to tell: listed by Insights, not something to do.
    { projectId: ws, kind: "fetch", surface: "link", actor: "anonymous", assetId: old.id, verdict: "superseded" },
    { projectId: ws, kind: "search", surface: "app", actor: "person", subject: "dark logo", verdict: "empty" },
  ]);
  const soon = await asset("campaign.jpg", day(3));
  const replaced = await asset("model-shot.jpg", day(10));
  await db.update(assets).set({ supersededBy: now.id }).where(eq(assets.id, replaced.id));
  await asset("far-off.jpg", day(90));
  await asset("ended.jpg", day(-1));

  let f = await fixesOf(ada.caller);
  assert.equal(f.stale.find((s) => s.referrer === "shop.example.com")?.first, day(0));
  assert.deepEqual(f.gaps.map((g) => g.q), ["dark logo"]);
  assert.deepEqual(
    f.licenses.map((l) => [l.asset.id, l.days, l.replacement?.id ?? null]),
    [
      [soon.id, 3, null],
      [replaced.id, 10, now.id],
    ],
  );
  // The shop, the search and the license with nothing to replace it.
  assert.equal(f.open, 3);

  await notifyStale(ada.caller, { referrer: "shop.example.com", assets: [old.id], emails: ["web@example.com"] });
  await createShare(ada.caller, { kind: "upload", name: "Dark logo" });
  f = await fixesOf(ada.caller);
  assert.equal(f.open, 1);
  assert.equal(f.stale.find((s) => s.referrer === "shop.example.com")?.notified?.by, "Fixer");
  assert.equal(f.gaps[0].requested?.by, "Fixer");

  // Renewed, it leaves the list.
  await db.update(assets).set({ rights: { license: "RM", territories: [], channels: [], embargo: null, expires: day(400), modelRelease: null } }).where(eq(assets.id, soon.id));
  assert.equal((await fixesOf(ada.caller)).open, 0);
});

test("Fixes take what Insights takes", async () => {
  await assert.rejects(fixesOf({ ...ada.caller, scope: "read" }), { code: "forbidden" });
});
