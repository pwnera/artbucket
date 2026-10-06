import assert from "node:assert/strict";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import { request, signUp } from "@/test/db";
import { callerFrom, describeCaller } from "@/lib/core/access";
import { createKey } from "@/lib/core/keys";
import { acceptInvitation, createInvitation } from "@/lib/core/people";
import { db } from "@/lib/db";
import { brands, grants, organizations, workspaces } from "@/lib/db/schema";

const NIL = "00000000-0000-0000-0000-000000000000";

// One story, in order: the first account takes the server, the next ones (SIGNUP=open) get an organization each.
const first = await signUp("Ada");
const second = await signUp("Grace");
const [seeded] = await db.select().from(workspaces).orderBy(workspaces.createdAt).limit(1);

test("the first account is the admin of the organization the server starts with, and gets none of its own", async () => {
  assert.equal(first.caller.workspace.id, seeded.id);
  assert.equal(first.caller.orgScope, "admin");
  const own = await db.select().from(grants).where(eq(grants.userId, first.user.id));
  assert.deepEqual(
    own.map((g) => [g.resource, g.resourceId, g.scope]),
    [["organization", seeded.organizationId, "admin"]],
  );
});

test("signing up where sign-up is open makes an organization, a workspace in it and its untouched default brand", async () => {
  const ws = second.caller.workspace;
  assert.notEqual(ws.organizationId, seeded.organizationId);
  assert.equal(ws.organization.name, "Grace's organization");
  assert.equal(second.caller.orgScope, "admin");
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ws.organizationId));
  assert.ok(org);
  const theirs = await db.select().from(workspaces).where(eq(workspaces.organizationId, org.id));
  assert.deepEqual(theirs.map((w) => w.id), [ws.id]);
  const [brand] = await db.select().from(brands).where(and(eq(brands.workspaceId, ws.id), eq(brands.isDefault, true)));
  assert.equal(brand?.slug, "default");
});

test("someone signed out is nowhere: no workspace, no scope, nothing to switch to", async () => {
  const caller = await callerFrom(request());
  assert.ok(caller);
  assert.equal(caller.scope, null);
  assert.equal(caller.user, null);
  const me = await describeCaller(caller);
  assert.equal(me.workspace.id, NIL);
  assert.equal(me.workspace.name, "");
  assert.deepEqual(me.workspaces, []);
  assert.deepEqual(me.hidden, []);
});

test("signed out, asking for a workspace by cookie shows nothing of it", async () => {
  const caller = (await callerFrom(request({ cookie: `ab_workspace=${second.caller.workspace.id}` })))!;
  const me = await describeCaller(caller);
  assert.equal(me.workspace.id, NIL);
  assert.equal(caller.scope, null);
});

test("a member reaches their own workspace only, whichever one the request asks for", async () => {
  const mine = second.caller.workspace.id;
  const other = first.caller.workspace.id;
  // By the workspace switcher's cookie, and by a route naming one (what /a/{id} does).
  for (const caller of [await callerFrom(request({ cookie: `${second.cookie}; ab_workspace=${other}` })), await callerFrom(request({ cookie: second.cookie }), other)]) {
    assert.equal(caller?.workspace.id, mine);
  }
  const me = await describeCaller(second.caller);
  assert.deepEqual(me.workspaces.map((w) => w.id), [mine]);
  // And the other way round.
  const ada = await callerFrom(request({ cookie: `${first.cookie}; ab_workspace=${mine}` }));
  assert.equal(ada?.workspace.id, other);
  assert.equal(ada?.scope, "admin");
});

test("an invitation to another organization's workspace, accepted, opens it at that scope", async () => {
  const ws = second.caller.workspace;
  const { url } = await createInvitation(second.caller, { email: first.user.email, resource: "workspace", resourceId: ws.id, scope: "read" });
  assert.ok(await acceptInvitation(url.split("/invite/")[1], { ...first.user, ip: null }));
  const ada = await callerFrom(request({ cookie: `${first.cookie}; ab_workspace=${ws.id}` }));
  assert.equal(ada?.workspace.id, ws.id);
  assert.equal(ada?.scope, "read");
  assert.equal(ada?.orgScope, null);
});

test("an API key works in its own workspace only, and an unknown one is refused, not anonymous", async () => {
  const { secret } = await createKey(second.caller, { name: "ci", scope: "read" });
  const bearer = { authorization: `Bearer ${secret}` };
  const keyed = await callerFrom(request(bearer), first.caller.workspace.id);
  assert.equal(keyed?.workspace.id, second.caller.workspace.id);
  assert.equal(keyed?.scope, "read");
  assert.equal(await callerFrom(request({ authorization: "Bearer ab_not-a-key" })), undefined);
  assert.equal(await callerFrom(request({ authorization: "Basic abc" })), undefined);
});

test("a caller's address is never taken from X-Forwarded-For while TRUSTED_PROXIES names no proxy", async () => {
  const caller = await callerFrom(request({ cookie: first.cookie, "x-forwarded-for": "203.0.113.7", "x-real-ip": "203.0.113.8" }));
  assert.equal(caller?.user?.id, first.user.id);
  assert.equal(caller?.ip, null);
});
