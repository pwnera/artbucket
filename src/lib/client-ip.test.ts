import assert from "node:assert/strict";
import { test } from "node:test";
import { blockList, clientIp, trustedProxies } from "./client-ip.ts";

const h = (headers: Record<string, string>) => new Headers(headers);
const trust = (v: string) => blockList(trustedProxies(v));

test("unset, X-Forwarded-For and X-Real-IP are ignored: a server reached directly can't tell", () => {
  assert.equal(clientIp(h({ "x-forwarded-for": "203.0.113.7" }), null), null);
  assert.equal(clientIp(h({ "x-real-ip": "203.0.113.7" }), null), null);
});

test("the client is the last entry that isn't a trusted proxy, whatever it wrote to the left", () => {
  const one = trust("127.0.0.1");
  // A proxy that appends (nginx's $proxy_add_x_forwarded_for, Fly, Traefik): the client's own value stays first.
  assert.equal(clientIp(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }), one), "203.0.113.7");
  // One that replaces (Caddy) or the hosted edge: a single entry.
  assert.equal(clientIp(h({ "x-forwarded-for": "203.0.113.7" }), one), "203.0.113.7");
  // Two proxies on private addresses, each appending the one before.
  assert.equal(clientIp(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.7, 10.0.3.4, fdaa:0:1::2" }), trust("private")), "203.0.113.7");
});

test("entries are read as proxies write them: ports, brackets, IPv4 mapped into IPv6", () => {
  const p = trust("private");
  assert.equal(clientIp(h({ "x-forwarded-for": "203.0.113.7:51234, 10.0.0.1" }), p), "203.0.113.7");
  assert.equal(clientIp(h({ "x-forwarded-for": "[2001:DB8::1]:443" }), p), "2001:db8::1");
  assert.equal(clientIp(h({ "x-forwarded-for": "203.0.113.7, ::ffff:10.0.0.1" }), p), "203.0.113.7");
});

test("garbage where a proxy should have written an address yields nothing; every hop trusted yields the furthest", () => {
  const p = trust("private");
  assert.equal(clientIp(h({ "x-forwarded-for": "203.0.113.7, unknown" }), p), null);
  assert.equal(clientIp(h({ "x-forwarded-for": "192.168.1.20, 10.0.0.1" }), p), "192.168.1.20");
});

test("without X-Forwarded-For, X-Real-IP is the proxy's word", () => {
  assert.equal(clientIp(h({ "x-real-ip": "203.0.113.7" }), trust("10.0.0.0/8")), "203.0.113.7");
  assert.equal(clientIp(h({}), trust("10.0.0.0/8")), null);
});

test("TRUSTED_PROXIES takes addresses, ranges and `private`, and refuses anything else", () => {
  assert.equal(trustedProxies(undefined), null);
  assert.equal(trustedProxies(" "), null);
  assert.deepEqual(trustedProxies("10.0.0.1, 2001:db8::/32"), ["10.0.0.1", "2001:db8::/32"]);
  assert.ok(trustedProxies("private")!.includes("fc00::/7"));
  for (const bad of ["10.0.0.0/33", "fly", "10.0.0.0/8/1", "::/129", "10.0.0.0/"]) assert.throws(() => trustedProxies(bad), /TRUSTED_PROXIES/);
});
