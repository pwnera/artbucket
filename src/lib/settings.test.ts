import assert from "node:assert/strict";
import { test } from "node:test";
import { lockedBy, merge, present, resolve, seal, sealed, unseal } from "./settings.ts";

const saved = { enabled: true, provider: "postmark" as const, from: "Org <a@org.test>", replyTo: null, apiKey: "pm-secret" };

test("the narrowest place that says something wins, then the environment, then the default", () => {
  const org = resolve("email", { organization: saved }, {});
  assert.deepEqual(org.value, saved);
  assert.equal(org.source, "organization");
  const env = { BRAND_NAME: "Server" };
  assert.equal(resolve("branding", {}, env).value.name, "Server");
  const own = resolve("branding", { organization: { name: "Acme" } }, env);
  assert.equal(own.value.name, "Acme");
  assert.equal(own.sources.name, "organization");
  assert.deepEqual(resolve("email", {}, {}).source, "default");
  assert.equal(resolve("email", {}, {}).value.enabled, false, "email is off unless configured");
});

test("the server's email, once set, is the server's alone: what an organization stored is ignored", () => {
  const env = { EMAIL_PROVIDER: "resend", EMAIL_FROM: "Server <s@host.test>", EMAIL_API_KEY: "re_x" };
  assert.equal(lockedBy("email", env), true);
  assert.equal(lockedBy("email", {}), false);
  assert.equal(lockedBy("branding", { BRAND_NAME: "Server" }), false, "branding stays each organization's");
  const r = resolve("email", { organization: { from: "Security <security@host.test>", enabled: false } }, env);
  assert.equal(r.source, "environment");
  assert.equal(r.value.from, "Server <s@host.test>");
  assert.equal(r.value.enabled, true);
  assert.equal(r.value.apiKey, "re_x");
});

test("a typo in EMAIL_PROVIDER fails loudly", () => {
  assert.throws(() => resolve("email", {}, { EMAIL_PROVIDER: "resnd" }));
});

test("secrets are blanked on the way out; a change stores only overrides, keeps a blank secret, clears on null", () => {
  const shown = present("email", saved);
  assert.equal(shown.value.apiKey, null);
  assert.deepEqual(shown.secrets, { apiKey: true });
  assert.deepEqual(merge("email", null, { from: "b@org.test" }), { from: "b@org.test" });
  assert.equal(merge("email", saved, { from: "b@org.test", apiKey: "" }).apiKey, "pm-secret");
  assert.equal(merge("email", saved, { apiKey: null }).apiKey, null);
  assert.equal(merge("email", saved, { apiKey: "new" }).apiKey, "new");
  assert.throws(() => merge("email", saved, { provider: "carrier-pigeon" }));
  assert.throws(() => merge("email", saved, { colour: "red" }), "unknown properties are refused");
});

test("sealed secrets open with the same secret only", () => {
  const box = seal("re_live_123", "server-secret");
  assert.notEqual(box, "re_live_123");
  assert.equal(unseal(box, "server-secret"), "re_live_123");
  assert.equal(unseal(box, "another-secret"), null);
  assert.equal(unseal("garbage", "server-secret"), null);
  const stored = sealed("email", saved, (s) => seal(s, "k"));
  assert.notEqual(stored.apiKey, "pm-secret");
  assert.equal(sealed("email", stored, (s) => unseal(s, "k")).apiKey, "pm-secret");
});
