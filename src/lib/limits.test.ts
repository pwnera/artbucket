import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSize, held, limitsFromEnv, organizationsFromEnv, over, parseSize, UNLIMITED, upgradeUrl } from "./limits.ts";
import { resolve } from "./settings.ts";

test("sizes read the way an operator writes them", () => {
  assert.equal(parseSize("10GB"), 10e9);
  assert.equal(parseSize("1.5 tb"), 1.5e12);
  assert.equal(parseSize("512"), 512);
  assert.equal(parseSize(2048), 2048);
  assert.equal(parseSize("ten gigs"), null);
  assert.equal(parseSize(-1), null);
  assert.equal(formatSize(10e9), "10 GB");
  assert.equal(formatSize(1_234_567), "1.2 MB");
  assert.equal(formatSize(0), "0 B");
  // Rounding up to 1000 of a unit is one of the next.
  assert.equal(formatSize(999_999), "1 MB");
  assert.equal(formatSize(999_600_000), "1 GB");
  assert.equal(formatSize(999), "999 B");
});

test("nothing is limited until the operator says so, and a limit is only passed by going over it", () => {
  assert.deepEqual(resolve("limits", {}, {}).value, UNLIMITED);
  assert.equal(over(null, 1e15), false);
  assert.equal(over(5, 4), false);
  assert.equal(over(5, 5), true);
  assert.equal(over(100, 60, 40), false);
  assert.equal(over(100, 60, 41), true);
});

test("the environment sets every organization's; one organization's row overrides it property by property", () => {
  const env = { LIMIT_STORAGE: "10GB", LIMIT_EDITORS: "5", LIMIT_DOMAINS: "2", LIMIT_EMAILS: "50", LIMIT_FEATURES: "shares" };
  assert.deepEqual(limitsFromEnv(env), { ...UNLIMITED, storage: 10e9, editors: 5, domains: 2, emails: 50, features: ["shares"] });
  assert.equal(limitsFromEnv({}), null);
  assert.deepEqual(limitsFromEnv({ LIMIT_FEATURES: "none" })?.features, []);
  const org = resolve("limits", { organization: { storage: "1TB", readOnly: true } }, env).value;
  assert.equal(org.storage, 1e12);
  assert.equal(org.editors, 5);
  assert.equal(org.readOnly, true);
  assert.equal(org.emails, 50);
  assert.equal(resolve("limits", { organization: { emails: 500 } }, env).value.emails, 500, "a plan's own");
  assert.throws(() => limitsFromEnv({ LIMIT_STORAGE: "lots" }));
  assert.throws(() => limitsFromEnv({ LIMIT_FEATURES: "chatbot" }));
  assert.deepEqual(limitsFromEnv({ LIMIT_FEATURES: "agents,shares" })?.features, ["agents", "shares"]);
  assert.deepEqual(limitsFromEnv({ LIMIT_FEATURES: "sso" })?.features, ["sso"]);
  assert.deepEqual(limitsFromEnv({ LIMIT_FEATURES: "branding,domains" })?.features, ["branding", "domains"]);
});

test("an admin is offered a plan only where the server sells them and the organization has none yet", () => {
  const billing = "https://example.com/billing";
  assert.equal(upgradeUrl(billing, true, "environment"), billing);
  assert.equal(upgradeUrl(billing, true, "default"), billing);
  assert.equal(upgradeUrl(billing, true, "organization"), null, "a row of its own is a plan already");
  assert.equal(upgradeUrl(billing, false, "environment"), null, "only an admin can take one");
  assert.equal(upgradeUrl(undefined, true, "environment"), null, "a server that sells none");
});

test("LIMIT_ORGANIZATIONS: how many organizations without a plan one person may be admin of", () => {
  assert.equal(organizationsFromEnv({}), null);
  assert.equal(organizationsFromEnv({ LIMIT_ORGANIZATIONS: "1" }), 1);
  assert.equal(organizationsFromEnv({ LIMIT_ORGANIZATIONS: " 3 " }), 3);
  assert.throws(() => organizationsFromEnv({ LIMIT_ORGANIZATIONS: "one" }));
  assert.throws(() => organizationsFromEnv({ LIMIT_ORGANIZATIONS: "-1" }));
  // Admin of one without a plan, the limit is 1: a second is over it.
  assert.equal(over(1, 1), true);
  assert.equal(over(1, 0), false);
});

test("suspended: a reason or true, only from the organization's row, and it holds the organization to read", () => {
  assert.equal(resolve("limits", {}, { LIMIT_STORAGE: "1GB" }).value.suspended, null, "the environment never suspends");
  const why = resolve("limits", { organization: { storage: "1TB", suspended: "phishing, report 12" } }, {}).value;
  assert.equal(why.suspended, "phishing, report 12");
  assert.equal(why.readOnly, false, "as stored");
  assert.equal(held(why).readOnly, true);
  assert.equal(held(why).storage, 1e12, "the plan's limits stay");
  assert.equal(resolve("limits", { organization: { suspended: true } }, {}).value.suspended, "Suspended");
  for (const off of [false, null, ""]) {
    const l = resolve("limits", { organization: { suspended: off } }, {}).value;
    assert.equal(l.suspended, null);
    assert.equal(held(l), l);
  }
});
