import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { request, signUp } from "@/test/db";
import { authorize } from "@/lib/api";
import { callerFrom } from "@/lib/core/access";
import { createBrand } from "@/lib/core/brand";
import { resolveBrand } from "@/lib/core/brands";
import { createJobToken, listKeys, revokeJobToken } from "@/lib/core/keys";
import { AssetError } from "@/lib/core/errors";
import { acceptInvitation, createInvitation, setGrant } from "@/lib/core/people";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";

const ada = await signUp("Ada");
const ws = ada.caller.project;
await createBrand(ada.caller, { name: "Acme", slug: "acme" });

// Sam reads the project and edits Acme only: their job token can do that much, and no more.
const sam = await signUp("Sam");
const { url } = await createInvitation(ada.caller, { email: sam.user.email, resource: "project", resourceId: ws.id, scope: "read" });
await acceptInvitation(url.split("/invite/")[1], { ...sam.user, ip: null });
await setGrant(ada.caller, { user: sam.user.id, resource: "brand", resourceId: (await resolveBrand(ws.id, "acme")).id, scope: "write" });
const samHere = (await callerFrom(request({ cookie: `${sam.cookie}; ab_project=${ws.id}` })))!;

const bearer = (token: string, path = "/api/v1/me", method = "GET") =>
  new Request(new URL(path, process.env.APP_URL), { method, headers: { authorization: `Bearer ${token}` } });

test("a job token acts as the person who made it, named after them, in their project, where Connections doesn't list it", async () => {
  const made = await createJobToken({ ...ada.caller, feature: "intelligence" }, { name: "brand import", minutes: 60 });
  const as = (await callerFrom(bearer(made.token)))!;
  assert.equal(as.project.id, ws.id);
  assert.equal(as.actor, "Ada · brand import");
  assert.equal(as.scope, ada.caller.scope, "their access, not more, not less");
  assert.ok(!((await authorize(bearer(made.token, "/api/v1/brands", "POST"), "brand.create")) instanceof Response), "Ada makes brands; so does her job");
  assert.ok(Date.parse(made.expiresAt) - Date.now() > 59 * 60_000);
  assert.equal((await listKeys(ada.caller)).length, 0, "not an agent of Connections");
});

test("held to what its person can do: Sam's job edits Acme and makes no brand", async () => {
  const made = await createJobToken({ ...samHere, feature: "intelligence" }, { name: "brand import", minutes: 30 });
  const create = await authorize(bearer(made.token, "/api/v1/brands", "POST"), "brand.create");
  assert.ok(create instanceof Response && create.status === 403);
  const edit = await authorize(bearer(made.token, "/api/v1/brand/rules?brand=acme", "PATCH"), "brand.edit");
  assert.ok(!(edit instanceof Response));
});

test("past its minutes it is refused; revoked by itself, gone; nothing else revokes as one", async () => {
  const made = await createJobToken({ ...ada.caller, feature: "intelligence" }, { name: "brand import", minutes: 5 });
  await db
    .update(apiKeys)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(apiKeys.id, made.id));
  assert.equal(await callerFrom(bearer(made.token)), undefined);

  const next = await createJobToken({ ...ada.caller, feature: "intelligence" }, { name: "brand import", minutes: 5 });
  const as = (await callerFrom(bearer(next.token)))!;
  assert.equal(await revokeJobToken(as), true);
  assert.equal(await callerFrom(bearer(next.token)), undefined);
  assert.equal(await revokeJobToken(ada.caller), false, "a session isn't a job token");
});

test("made only from a person's session, for a feature", async () => {
  await assert.rejects(createJobToken(ada.caller, { name: "brand import", minutes: 5 }), (e) => e instanceof AssetError && e.code === "forbidden");
  const made = await createJobToken({ ...ada.caller, feature: "intelligence" }, { name: "brand import", minutes: 5 });
  const as = (await callerFrom(bearer(made.token)))!;
  await assert.rejects(
    createJobToken({ ...as, feature: "intelligence" }, { name: "again", minutes: 5 }),
    (e) => e instanceof AssetError && e.code === "forbidden",
  );
});
