import assert from "node:assert/strict";
import { test } from "node:test";
import { crc32, uniqueNames, zip } from "./zip.ts";

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("zip lays out entries, central directory and end record", () => {
  const a = new TextEncoder().encode("hello");
  const b = new Uint8Array([1, 2, 3]);
  const out = zip([
    { name: "a.txt", data: a },
    { name: "é.bin", data: b },
  ]);
  const v = new DataView(out.buffer);
  const end = out.length - 22;
  assert.equal(v.getUint32(end, true), 0x06054b50);
  assert.equal(v.getUint16(end + 10, true), 2);
  const cdOffset = v.getUint32(end + 16, true);
  // Second local header sits right after the first entry's bytes.
  assert.equal(cdOffset, 30 + 5 + 5 + 30 + "é.bin".length + 1 + 3);
  assert.equal(v.getUint32(cdOffset, true), 0x02014b50);
  assert.equal(v.getUint32(cdOffset + 16, true), crc32(a));
  assert.equal(v.getUint32(30 + 5 + 5, true), 0x04034b50);
});

test("uniqueNames suffixes repeats before the extension", () => {
  assert.deepEqual(uniqueNames(["a.png", "a.png", "b", "b", "a.png"]), ["a.png", "a (2).png", "b", "b (2)", "a (3).png"]);
});
