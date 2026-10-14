import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { eq } from "drizzle-orm";
import { signUp } from "@/test/db";
import { db } from "@/lib/db";
import { assets, events, grants } from "@/lib/db/schema";
import { ingestBytes } from "@/lib/core/assets";
import { publishBrand } from "@/lib/core/brand";
import { digestOn, isoWeek, lastWeek, sendDigests, setDigest, unsubscribe, unsubscribeToken } from "@/lib/core/digest";
import { updateSetting } from "@/lib/core/settings";

// The console provider prints each message: kept here to read, not in the test's output.
const mails: string[] = [];
mock.method(console, "info", (s: unknown) => void (typeof s === "string" && s.startsWith("email to ") && mails.push(s)));
const to = (who: { user: { email: string } }) => mails.filter((m) => m.startsWith(`email to ${who.user.email} `));

const DAY = 86_400_000;
/** The Monday after today, at 06:00 UTC: its digest is of the week holding today. */
const monday = (() => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + (((8 - d.getUTCDay()) % 7 || 7) * DAY) + 6 * 3600_000);
})();

const ada = await signUp("Ada");
const [grace, vera, olga] = await Promise.all([signUp("Grace"), signUp("Vera"), signUp("Olga")]);
const project = ada.caller.project;
await updateSetting(ada.caller, "organization", "email", { enabled: true, provider: "console", from: "Test <test@example.com>" });
// Grace and Olga edit Ada's project; Vera only views it.
for (const [who, scope] of [[grace, "write"], [olga, "write"], [vera, "read"]] as const) {
  await db.insert(grants).values({ userId: who.user.id, organizationId: project.organizationId, projectId: project.id, resource: "project", resourceId: project.id, scope });
}
await setDigest(olga.user.id, false);

test("ISO weeks, and the week a Monday's digest covers", () => {
  assert.equal(isoWeek(new Date("2026-10-14T12:00:00Z")), "2026-W42");
  assert.equal(isoWeek(new Date("2027-01-01T00:00:00Z")), "2026-W53");
  assert.equal(isoWeek(new Date("2025-12-29T00:00:00Z")), "2026-W01");
  const w = lastWeek(new Date("2026-10-19T06:00:00Z"));
  assert.equal(w.start.toISOString(), "2026-10-12T00:00:00.000Z");
  assert.equal(w.end.toISOString(), "2026-10-19T00:00:00.000Z");
  assert.equal(w.week, "2026-W42");
});

test("a week with nothing in it sends nothing", async () => {
  assert.equal(await sendDigests(monday), 0);
  assert.equal(mails.length, 0);
});

test("editors and admins get the week once; viewers and those who turned it off don't", async () => {
  await publishBrand(ada.caller, undefined, { note: "New spring palette" });
  await ingestBytes(ada.caller, { bytes: Buffer.from("the brief"), mime: "text/plain", filename: "brief.txt" });
  const photo = (await ingestBytes(ada.caller, { bytes: Buffer.from("a photo"), mime: "text/plain", filename: "hero.txt" })).asset;
  const ends = new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10);
  await db.update(assets).set({ rights: { license: "RM", territories: [], channels: [], embargo: null, expires: ends, modelRelease: null } }).where(eq(assets.id, photo.id));
  await db.insert(events).values({ projectId: project.id, kind: "search", surface: "app", actor: "person", subject: "winter campaign", verdict: "empty" });

  assert.equal(await sendDigests(new Date(monday.getTime() + DAY)), 0, "only on Mondays");
  assert.equal(await sendDigests(monday), 2);
  const [mail] = to(ada);
  assert.match(mail, /: Your week in /);
  assert.match(mail, /1 brand release went out:\n.*, version 1: New spring palette http:\/\/localhost:3000\/brands\//);
  assert.match(mail, /2 new assets: hero\.txt and brief\.txt\./);
  assert.match(mail, /1 license ends in the next two weeks:\nhero\.txt, last day/);
  assert.match(mail, /People searched for "winter campaign" and found nothing\./);
  assert.match(mail, new RegExp(`Unsubscribe: http://localhost:3000/unsubscribe/${unsubscribeToken(ada.user.id).replace(".", "\\.")}`));
  assert.equal(to(grace).length, 1);
  assert.equal(to(vera).length, 0, "a viewer gets none");
  assert.equal(to(olga).length, 0, "turned off");

  // Again the same Monday, as another instance would: nothing more.
  assert.equal(await sendDigests(monday), 0);
  // The next Monday is a new week: what still waits (the license) goes again.
  assert.equal(await sendDigests(new Date(monday.getTime() + 7 * DAY)), 2);
});

test("the email's link turns it off, and only with a token of ours", async () => {
  assert.equal(await unsubscribe(`${grace.user.id}.forged`), false);
  assert.equal(await digestOn(grace.user.id), true);
  assert.equal(await unsubscribe(unsubscribeToken(grace.user.id)), true);
  assert.equal(await digestOn(grace.user.id), false);
  // A third week: something waits for review.
  await db.update(assets).set({ status: "proposed" }).where(eq(assets.filename, "brief.txt"));
  const before = to(grace).length;
  assert.equal(await sendDigests(new Date(monday.getTime() + 14 * DAY)), 1);
  assert.equal(to(grace).length, before);
  assert.match(to(ada).at(-1)!, /^1 asset waits for review\. http:\/\/localhost:3000\/review\?project=/m);
});
