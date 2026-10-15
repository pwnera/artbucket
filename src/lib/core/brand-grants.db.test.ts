import assert from "node:assert/strict";
import { test } from "node:test";
import { request, signUp } from "@/test/db";
import { authorize } from "@/lib/api";
import { callerFrom } from "@/lib/core/access";
import { createBrand } from "@/lib/core/brand";
import { listBrands, resolveBrand, updateBrand } from "@/lib/core/brands";
import { parseQuery } from "@/lib/catalog";
import { searchCatalog, whoCan } from "@/lib/core/catalog";
import { acceptInvitation, createInvitation, setGrant } from "@/lib/core/people";
import { handleMcp } from "@/lib/mcp";

const ada = await signUp("Ada");
const ws = ada.caller.project;
await createBrand(ada.caller, { name: "Acme", slug: "acme" });
await createBrand(ada.caller, { name: "Acme Kids", slug: "kids" });
const kids = await resolveBrand(ws.id, "kids");

// Sam reads the project and edits Acme Kids only.
const sam = await signUp("Sam");
const { url } = await createInvitation(ada.caller, { email: sam.user.email, resource: "project", resourceId: ws.id, scope: "read" });
await acceptInvitation(url.split("/invite/")[1], { ...sam.user, ip: null });
await setGrant(ada.caller, { user: sam.user.id, resource: "brand", resourceId: kids.id, scope: "write" });
const asSam = (path: string, method = "PATCH") => new Request(new URL(path, process.env.APP_URL), { method, headers: { cookie: `${sam.cookie}; ab_project=${ws.id}`, authorization: "" } });
const samHere = async () => (await callerFrom(request({ cookie: `${sam.cookie}; ab_project=${ws.id}` })))!;

test("a grant on one brand edits that brand, and no other", async () => {
  const ok = await authorize(asSam("/api/v1/brands/kids/theme"), "brand.edit");
  assert.ok(!(ok instanceof Response), "kids");
  const no = await authorize(asSam("/api/v1/brands/acme/theme"), "brand.edit");
  assert.ok(no instanceof Response && no.status === 403, "acme");
  // Rules name their brand by ?brand=, the default otherwise.
  const rules = await authorize(asSam("/api/v1/brand/rules?brand=kids", "POST"), "brand.edit");
  assert.ok(!(rules instanceof Response));
});

test("making brands is the project's, not a brand's", async () => {
  const no = await authorize(asSam("/api/v1/brands", "POST"), "brand.create");
  assert.ok(no instanceof Response && no.status === 403);
});

test("a private brand is gone for the project's readers, there for its grants and admins", async () => {
  await updateBrand(ws.id, "acme", { private: true });
  const sams = (await listBrands(ws.id, await samHere())).map((b) => b.slug);
  assert.ok(!sams.includes("acme"));
  assert.ok(sams.includes("kids"));
  assert.ok((await listBrands(ws.id, ada.caller)).some((b) => b.slug === "acme"));
  const gone = await authorize(asSam("/api/v1/brands/acme", "GET"), "brand.read");
  assert.ok(gone instanceof Response && gone.status === 404, "not there for Sam");
  assert.equal((await searchCatalog(await samHere(), parseQuery("type:brand"))).items.some((i) => i.slug === "acme"), false);
});

test("MCP resources/read refuses a private brand's rules and pages to a reader without a grant on it", async () => {
  const sam = await samHere();
  const read = async (uri: string, caller = sam) =>
    (await handleMcp({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri } }, caller)) as { result?: unknown; error?: { code: number } };
  for (const uri of ["artbucket://brands/acme/rules", "artbucket://brands/acme/rules/social", "artbucket://brands/acme/pages/overview"]) {
    assert.equal((await read(uri)).error?.code, -32002, uri);
  }
  assert.ok((await read("artbucket://brands/kids/rules")).result, "kids, Sam's grant");
  assert.ok((await read("artbucket://brands/acme/rules", ada.caller)).result, "an admin");
});

test("who can reach it: the brand grant, said as such", async () => {
  const w = (await whoCan(ada.caller, kids.id))!;
  const s = w.holders.find((h) => h.who === "Sam")!;
  assert.equal(s.role, "Editor");
  assert.equal(s.via, "Directly on this brand");
});
