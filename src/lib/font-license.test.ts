import assert from "node:assert/strict";
import { test } from "node:test";
import { brotliCompressSync, deflateSync } from "node:zlib";
import { fontLicense } from "./font-license.ts";

/** A `name` table holding one Windows (UTF-16BE) string per id. */
function nameTable(names: Record<number, string>) {
  const entries = Object.entries(names).map(([id, s]) => [Number(id), Buffer.from(s, "utf16le").swap16()] as const);
  const head = Buffer.alloc(6 + entries.length * 12);
  head.writeUInt16BE(entries.length, 2);
  head.writeUInt16BE(head.length, 4);
  let offset = 0;
  entries.forEach(([id, s], i) => {
    const at = 6 + i * 12;
    [3, 1, 0x409, id, s.length, offset].forEach((v, j) => head.writeUInt16BE(v, at + j * 2));
    offset += s.length;
  });
  return Buffer.concat([head, ...entries.map(([, s]) => s)]);
}

/** A TrueType file of a `head` table and a `name` table. */
function ttf(name: Buffer) {
  const tables: [string, Buffer][] = [["head", Buffer.alloc(54)], ["name", name]];
  const dir = Buffer.alloc(12 + tables.length * 16);
  dir.writeUInt32BE(0x00010000, 0);
  dir.writeUInt16BE(tables.length, 4);
  let offset = dir.length;
  tables.forEach(([tag, t], i) => {
    dir.write(tag, 12 + i * 16, "latin1");
    dir.writeUInt32BE(offset, 12 + i * 16 + 8);
    dir.writeUInt32BE(t.length, 12 + i * 16 + 12);
    offset += t.length;
  });
  return Buffer.concat([dir, ...tables.map(([, t]) => t)]);
}

/** `extra` bytes more than the directory says are packed after the table: a bomb's shape. */
function woff(name: Buffer, extra = 0) {
  const z = deflateSync(Buffer.concat([name, Buffer.alloc(extra)]));
  const out = Buffer.alloc(44 + 20);
  out.write("wOFF", 0, "latin1");
  out.writeUInt16BE(1, 12);
  out.write("name", 44, "latin1");
  out.writeUInt32BE(out.length, 48);
  out.writeUInt32BE(z.length, 52);
  out.writeUInt32BE(name.length, 56);
  return Buffer.concat([out, z]);
}

/** WOFF2: `head` (known tag 1) then `name` (5), lengths in UIntBase128, one Brotli stream. */
function woff2(name: Buffer, extra = 0) {
  const head = Buffer.alloc(54);
  const base128 = (n: number) => (n < 128 ? [n] : [0x80 | (n >> 7), n & 0x7f]);
  const dir = Buffer.from([1, ...base128(head.length), 5, ...base128(name.length)]);
  const stream = brotliCompressSync(Buffer.concat([head, name, Buffer.alloc(extra)]));
  const out = Buffer.alloc(48);
  out.write("wOF2", 0, "latin1");
  out.writeUInt32BE(0x00010000, 4);
  out.writeUInt16BE(2, 12);
  out.writeUInt32BE(stream.length, 20);
  return Buffer.concat([out, dir, stream]);
}

test("an open font names its license, in every container", () => {
  const ofl = nameTable({ 13: "This Font Software is licensed under the SIL Open Font License, Version 1.1.", 14: "https://openfontlicense.org" });
  for (const f of [ttf(ofl), woff(ofl), woff2(ofl)]) assert.equal(fontLicense(f), "SIL Open Font License");
  assert.equal(fontLicense(ttf(nameTable({ 14: "http://www.apache.org/licenses/LICENSE-2.0" }))), "Apache License 2.0");
});

test("a foundry's EULA comes back as its first sentence", () => {
  const eula = "You may use this font as permitted by the EULA for the product in which this font is included. Any other use is prohibited.";
  assert.equal(fontLicense(woff2(nameTable({ 13: eula }))), "You may use this font as permitted by the EULA for the product in which this font is included.");
  assert.equal(fontLicense(ttf(nameTable({ 13: "x".repeat(400) })))?.length, 200);
});

test("no license, or no font, names nothing", () => {
  assert.equal(fontLicense(ttf(nameTable({ 1: "Acme Sans" }))), null);
  assert.equal(fontLicense(Buffer.from("{}")), null);
  assert.equal(fontLicense(Buffer.from("wOF2 broken")), null);
});

test("a compressed table never unpacks past the size its directory gives: a bomb names nothing", () => {
  const ofl = nameTable({ 13: "SIL Open Font License" });
  assert.equal(fontLicense(woff(ofl, 1 << 20)), null);
  assert.equal(fontLicense(woff2(ofl, 1 << 20)), null);
});
