import assert from "node:assert/strict";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import { plan, request, signUp } from "@/test/db";
import { db } from "@/lib/db";
import { grants, groupMembers } from "@/lib/db/schema";
import { callerFrom } from "@/lib/core/access";
import { whoCan } from "@/lib/core/catalog";
import { createCollection } from "@/lib/core/collections";
import { createGroup, deleteGroup, listGroups, setGroupMembers } from "@/lib/core/groups";
import { acceptInvitation, createInvitation, removeGrant, setGrant } from "@/lib/core/people";

const ada = await signUp("Ada");
const ws = ada.caller.project;

/** Someone joins with a viewer's grant on the project, as an invitation gives it. */
async function join(name: string) {
  const p = await signUp(name);
  const { url } = await createInvitation(ada.caller, { email: p.user.email, resource: "project", resourceId: ws.id, scope: "read" });
  await acceptInvitation(url.split("/invite/")[1], { ...p.user, ip: null });
  return { ...p, here: async () => (await callerFrom(request({ cookie: `${p.cookie}; ab_project=${ws.id}` })))! };
}

const sam = await join("Sam");
const lea = await join("Lea");
const team = await createGroup(ada.caller, { name: "Brand team" });

test("a group's grant is each member's: Editor through the group, Viewer on their own, highest wins", async () => {
  await setGroupMembers(ada.caller, team.id, { add: [sam.user.id] });
  await setGrant(ada.caller, { group: team.id, resource: "project", resourceId: ws.id, scope: "write" });
  assert.equal((await sam.here()).scope, "write");
  assert.equal((await lea.here()).scope, "read", "not in the group");
});

test("who can reach it says the role comes through the group", async () => {
  const c = await createCollection(ada.caller, { name: "Logos" });
  const w = (await whoCan(ada.caller, c.id))!;
  assert.match(w.holders.find((h) => h.who === "Sam")!.via, /^Group Brand team, on project /);
});

test("only people of the organization can be in its groups", async () => {
  const stranger = await signUp("Stranger");
  await assert.rejects(setGroupMembers(ada.caller, team.id, { add: [stranger.user.id] }), /Only people of the organization/);
});

test("leaving the organization leaves its groups: the group never lets them back in", async () => {
  await setGroupMembers(ada.caller, team.id, { add: [lea.user.id] });
  const [own] = await db.select().from(grants).where(and(eq(grants.userId, lea.user.id), eq(grants.organizationId, ws.organizationId)));
  assert.ok(await removeGrant(ada.caller, own.id));
  const left = await db.select().from(groupMembers).where(eq(groupMembers.userId, lea.user.id));
  assert.deepEqual(left, []);
  assert.equal((await lea.here()).project.id === ws.id && (await lea.here()).scope, false);
});

test("deleting a group takes its grants: members keep only their own", async () => {
  const g = (await listGroups(ada.caller)).find((x) => x.id === team.id)!;
  assert.deepEqual(g.grants.map((x) => x.scope), ["write"]);
  await deleteGroup(ada.caller, team.id);
  assert.equal((await sam.here()).scope, "read");
});

test("a group's members take editors' seats", async () => {
  const max = await join("Max");
  const editors = await createGroup(ada.caller, { name: "Editors" });
  await setGrant(ada.caller, { group: editors.id, resource: "project", resourceId: ws.id, scope: "write" });
  await plan(ws.organizationId, { editors: 2 });
  // Ada is one: Sam makes two, Max would be a third.
  await setGroupMembers(ada.caller, editors.id, { add: [sam.user.id] });
  await assert.rejects(setGroupMembers(ada.caller, editors.id, { add: [max.user.id] }), /room for 2 editors/);
});

test("only the organization's admins manage groups", async () => {
  await assert.rejects(createGroup(await sam.here(), { name: "Mine" }), /Only the organization's admins/);
});
