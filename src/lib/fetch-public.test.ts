import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http from "node:http";
import { mock, test } from "node:test";
import { fetchPublic, isPublicAddress, USER_AGENT } from "./fetch-public.ts";

test("private, loopback, link-local and special ranges are not public", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "64:ff9b::a00:1",
    "not an ip",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
});

test("ordinary internet addresses are public", () => {
  for (const ip of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])
    assert.equal(isPublicAddress(ip), true, ip);
});

test("refuses IP literals and names that point inward, before connecting", async () => {
  for (const url of ["http://127.0.0.1:3000/", "http://[::1]/", "http://169.254.169.254/latest", "http://localhost/"])
    await assert.rejects(fetchPublic(url, { maxBytes: 10 }), /public|non-public/, url);
  await assert.rejects(fetchPublic("file:///etc/passwd", { maxBytes: 10 }), /http/);
});

test("names itself in the User-Agent, as Wikimedia and others require of bots", async (t) => {
  let headers: http.OutgoingHttpHeaders | undefined;
  t.after(() => mock.restoreAll());
  mock.method(http, "get", (_url: URL, opts: http.RequestOptions) => {
    headers = opts.headers as http.OutgoingHttpHeaders;
    const req = new EventEmitter();
    queueMicrotask(() => req.emit("error", new Error("not sent")));
    return req;
  });
  await assert.rejects(fetchPublic("http://example.com/a.jpg", { maxBytes: 10 }), /not sent/);
  assert.equal(headers?.["user-agent"], USER_AGENT);
  assert.match(USER_AGENT, /^Artbucket\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/pwnera\/artbucket\)$/);
});

test("IPv6 forms that carry an IPv4 address inward are not public", () => {
  // IPv4-compatible (deprecated, ::/96) and local-use NAT64 (64:ff9b:1::/48, RFC 8215).
  for (const ip of ["::7f00:1", "::a9fe:a9fe", "64:ff9b:1::a00:1"]) assert.equal(isPublicAddress(ip), false, ip);
  // Written however a URL writes it.
  for (const url of ["http://[::127.0.0.1]/", "http://[::ffff:127.0.0.1]/", "http://[0:0:0:0:0:ffff:7f00:1]/"])
    assert.equal(isPublicAddress(new URL(url).hostname.slice(1, -1)), false, url);
});

test("a fetch with no signal still ends: a body trickled in forever is cut off", async (t) => {
  let signal: AbortSignal | undefined;
  t.after(() => mock.restoreAll());
  mock.method(http, "get", (_url: URL, opts: http.RequestOptions) => {
    signal = opts.signal;
    const req = new EventEmitter();
    queueMicrotask(() => req.emit("error", new Error("not sent")));
    return req;
  });
  await assert.rejects(fetchPublic("http://example.com/a.jpg", { maxBytes: 10 }), /not sent/);
  assert.ok(signal, "a deadline for the whole fetch");
});
