import assert from "node:assert/strict";
import { test } from "node:test";
import { request, signUp } from "@/test/db";
import { callerFrom } from "@/lib/core/access";
import { createBrand } from "@/lib/core/brand";
import { listBrands, resolveBrand } from "@/lib/core/brands";
import { catalogTree, describeObject, whoCan } from "@/lib/core/catalog";
import { acceptInvitation, createInvitation, createWorkspace, removeGrant } from "@/lib/core/people";
import { shareObject } from "@/lib/core/project-shares";
import { can } from "@/lib/permissions";

const ada = await signUp("Ada");
const corporate = ada.caller.workspace;
await createBrand(ada.caller, { name: "Acme", slug: "acme" });
const acme = await resolveBrand(corporate.id, "acme");
const q4 = await createWorkspace(ada.caller, { name: "Q4 Campaign" });

// Northwind's Sam: an editor of Q4 Campaign, nothing in Corporate.
const sam = await signUp("Sam");
const { url } = await createInvitation(ada.caller, { email: sam.user.email, resource: "workspace", resourceId: q4.id, scope: "write" });
await acceptInvitation(url.split("/invite/")[1], { ...sam.user, ip: null });
const samIn = async (ws: string) => (await callerFrom(request({ cookie: `${sam.cookie}; ab_workspace=${ws}` })))!;

test("before a share, Corporate is out of a Q4 member's reach", async () => {
  assert.equal((await samIn(corporate.id)).workspace.id, q4.id, "lands in Q4 instead");
});

test("shared into Q4 as Viewer: its members read the brand where it is, and edit nothing", async () => {
  const shared = await shareObject(ada.caller, acme.id, q4.slug);
  assert.equal(shared.project.name, "Q4 Campaign");
  const there = await samIn(corporate.id);
  assert.equal(there.workspace.id, corporate.id, "Corporate opens, narrowed to what was shared");
  assert.equal(there.scope, null);
  assert.ok(can(there, "brand.read", { id: acme.id }));
  assert.ok(!can(there, "brand.edit", { id: acme.id }), "Editor in Q4 is still Viewer on what was shared");
  assert.deepEqual((await listBrands(corporate.id, there)).map((b) => b.slug), ["acme"]);
});

test("the catalog lists it in Q4 too, shared from Corporate, and says who has it", async () => {
  const tree = await catalogTree(await samIn(q4.id));
  const inQ4 = tree.projects.find((p) => p.id === q4.id)!.objects.find((o) => o.id === acme.id);
  assert.equal(inQ4?.sharedFrom?.name, corporate.name);
  const d = (await describeObject(ada.caller, acme.id))!;
  assert.deepEqual(d.sharedWith.map((x) => x.project.name), ["Q4 Campaign"]);
  const w = (await whoCan(ada.caller, acme.id))!;
  assert.ok(w.holders.some((h) => h.kind === "project" && h.who === "Q4 Campaign" && h.role === "Viewer"));
});

test("sharing takes admin on the thing", async () => {
  await assert.rejects(shareObject(await samIn(q4.id), acme.id, q4.slug), /Only a brand|takes admin/);
});

test("an admin of the receiving project takes it back: its members lose it", async () => {
  const d = (await describeObject(ada.caller, acme.id))!;
  const adaInQ4 = (await callerFrom(request({ cookie: `${ada.cookie}; ab_workspace=${q4.id}` })))!;
  assert.ok(await removeGrant(adaInQ4, d.sharedWith[0].grant));
  assert.equal((await samIn(corporate.id)).workspace.id, q4.id);
});
