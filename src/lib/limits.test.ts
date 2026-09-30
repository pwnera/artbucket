import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSize, limitsFromEnv, organizationsFromEnv, over, parseSize, UNLIMITED } from "./limits.ts";
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
  const env = { LIMIT_STORAGE: "10GB", LIMIT_EDITORS: "5", LIMIT_DOMAINS: "2", LIMIT_FEATURES: "shares" };
  assert.deepEqual(limitsFromEnv(env), { ...UNLIMITED, storage: 10e9, editors: 5, domains: 2, features: ["shares"] });
  assert.equal(limitsFromEnv({}), null);
  assert.deepEqual(limitsFromEnv({ LIMIT_FEATURES: "none" })?.features, []);
  const org = resolve("limits", { organization: { storage: "1TB", readOnly: true } }, env).value;
  assert.equal(org.storage, 1e12);
  assert.equal(org.editors, 5);
  assert.equal(org.readOnly, true);
  assert.throws(() => limitsFromEnv({ LIMIT_STORAGE: "lots" }));
  assert.throws(() => limitsFromEnv({ LIMIT_FEATURES: "chatbot" }));
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
