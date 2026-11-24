import assert from "node:assert/strict";
import { test } from "node:test";
import { appOriginAt, isAppOrigin } from "@/lib/core/domains";
import { env } from "@/lib/env";

const scheme = new URL(env.APP_URL).protocol;

test("an operator's extra host (APP_EXTRA_HOSTS) answers as an origin of the app's, like APP_URL", async (t) => {
  const was = env.APP_EXTRA_HOSTS;
  env.APP_EXTRA_HOSTS = ["brand.example.com", "shop.example.net"];
  t.after(() => void (env.APP_EXTRA_HOSTS = was));
  assert.deepEqual(await appOriginAt("brand.example.com"), [`${scheme}//brand.example.com`]);
  // A host name's own trimming applies, as it does for a claimed domain: the port goes, the case comes down.
  assert.deepEqual(await appOriginAt("brand.example.com:8443"), [`${scheme}//brand.example.com`]);
  assert.deepEqual(await appOriginAt("shop.example.net"), [`${scheme}//shop.example.net`]);
  assert.deepEqual(await appOriginAt(null), []);
  // A browser origin too (isAppOrigin): an extra host is the app's own, another's is not.
  assert.ok(await isAppOrigin(`${scheme}//brand.example.com/some/path`));
  assert.ok(!(await isAppOrigin(`${scheme}//other.example.com`)));
});

test("an unlisted host still needs a claim: nothing answers for it", async (t) => {
  const was = env.APP_EXTRA_HOSTS;
  delete env.APP_EXTRA_HOSTS;
  t.after(() => void (env.APP_EXTRA_HOSTS = was));
  assert.deepEqual(await appOriginAt("brand.example.com"), []);
  assert.deepEqual(await appOriginAt("shop.example.net:443"), []);
});
