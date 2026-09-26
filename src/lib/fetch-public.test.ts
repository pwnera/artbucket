import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchPublic, isPublicAddress } from "./fetch-public.ts";

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
