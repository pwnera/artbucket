import assert from "node:assert/strict";
import { test } from "node:test";
import { assetIdsIn, signAsset, signedUntil, signUrlsIn, withSignature } from "./signed.ts";

const SECRET = "x".repeat(32);
const A = "016b937f-a66d-47e7-a81d-b6f14363d6d5";
const B = "11111111-2222-4333-8444-555555555555";
const now = new Date("2026-10-01T12:00:00Z");
const later = new Date("2026-10-02T12:00:00Z");

test("a signature opens its asset until it expires, and nothing else", () => {
  const s = signAsset(SECRET, A, later);
  assert.deepEqual(signedUntil(SECRET, A, s, now), later);
  assert.equal(signedUntil(SECRET, B, s, now), null, "another asset");
  assert.equal(signedUntil("y".repeat(32), A, s, now), null, "another secret");
  assert.equal(signedUntil(SECRET, A, s, new Date(later.getTime() + 1000)), null, "expired");
  const [exp, mac] = s.split(".");
  assert.equal(signedUntil(SECRET, A, `${Number(exp) + 86400}.${mac}`, now), null, "extended by hand");
  assert.equal(signedUntil(SECRET, A, null, now), null);
  assert.equal(signedUntil(SECRET, A, "garbage", now), null);
  assert.equal(signedUntil(SECRET, A, `${exp}.`, now), null);
});

test("a step rounds the expiry up, so the same page hands out the same URL", () => {
  const a = signAsset(SECRET, A, new Date("2026-10-01T12:00:01Z"), 3600);
  const b = signAsset(SECRET, A, new Date("2026-10-01T12:59:59Z"), 3600);
  assert.equal(a, b);
  assert.equal(Number(a.split(".")[0]) % 3600, 0);
});

test("URLs in rich text are signed for the assets asked, once", () => {
  const html = `<img src="https://x.io/a/${A}/w_1600,f_webp"><img src="/a/${B}"><a href="/a/${A}?download">`;
  const out = signUrlsIn(html, (id) => (id === A ? "9.sig" : null));
  assert.equal(out, `<img src="https://x.io/a/${A}/w_1600,f_webp?s=9.sig"><img src="/a/${B}"><a href="/a/${A}?download&s=9.sig">`);
  assert.equal(signUrlsIn(out, () => "10.other"), out.replace(`/a/${B}"`, `/a/${B}?s=10.other"`), "never twice");
  assert.deepEqual(assetIdsIn(html), [A, B]);
  assert.equal(withSignature(`/a/${A}?download`, "1.x"), `/a/${A}?download&s=1.x`);
});
