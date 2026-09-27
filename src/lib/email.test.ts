import assert from "node:assert/strict";
import { test } from "node:test";
import { deliver, layout, parseAddress, PROVIDERS, unusable, type EmailSettings } from "./email.ts";

const base: EmailSettings = { enabled: true, provider: "resend", from: "Artbucket <hi@brand.test>", replyTo: null, apiKey: "key" };
const msg = layout({ to: "sam@x.test", subject: "Hi", lines: ["Line <one>"], action: { label: "Open", url: "https://a.test/x?y=1&z=2" } });

test("addresses with and without a name", () => {
  assert.deepEqual(parseAddress("Artbucket <hi@brand.test>"), { name: "Artbucket", email: "hi@brand.test" });
  assert.deepEqual(parseAddress("hi@brand.test"), { name: null, email: "hi@brand.test" });
});

test("settings that can't send say why", () => {
  assert.equal(unusable({ ...base, enabled: false }), "Email is off");
  assert.equal(unusable({ ...base, apiKey: null }), "Resend needs an API key");
  assert.equal(unusable({ ...base, from: "nobody" }), "Set a from address");
  assert.equal(unusable({ ...base, provider: "console", apiKey: null }), null);
  assert.equal(unusable(base), null);
});

test("each provider gets its own request shape", () => {
  const resend = PROVIDERS.resend.request(base, msg);
  assert.ok("url" in resend && resend.url === "https://api.resend.com/emails");
  assert.ok("headers" in resend && resend.headers.Authorization === "Bearer key");
  const pm = PROVIDERS.postmark.request(base, msg);
  assert.ok("headers" in pm && pm.headers["X-Postmark-Server-Token"] === "key");
  const sg = PROVIDERS.sendgrid.request(base, msg);
  assert.ok("body" in sg);
  assert.deepEqual((sg.body as { from: unknown }).from, { email: "hi@brand.test", name: "Artbucket" });
});

test("the html escapes what it is given; the text keeps the link", () => {
  assert.match(msg.html, /Line &#60;one&#62;/);
  assert.match(msg.html, /y=1&#38;z=2/);
  assert.match(msg.text, /Open: https:\/\/a\.test\/x\?y=1&z=2/);
});

test("deliver refuses unusable settings and reports a provider's refusal", async () => {
  await assert.rejects(deliver({ ...base, enabled: false }, msg), /off/);
  const refusing = (async () => new Response("domain not verified", { status: 403 })) as typeof fetch;
  await assert.rejects(deliver(base, msg, refusing), /Resend refused it \(403\): domain not verified/);
  let sent: RequestInit | undefined;
  const ok = (async (_u: unknown, init?: RequestInit) => ((sent = init), new Response("{}"))) as typeof fetch;
  await deliver(base, msg, ok);
  assert.equal(JSON.parse(String(sent?.body)).to[0], "sam@x.test");
});
