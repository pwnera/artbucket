import assert from "node:assert/strict";
import { test } from "node:test";
import { crc32, uniqueNames, unzip, zip } from "./zip.ts";

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

test("unzip reads back stored and deflated entries", async () => {
  const hello = new TextEncoder().encode("hello hello hello hello");
  const stored = zip([{ name: "a.txt", data: hello }, { name: "b/preview.png", data: new Uint8Array([1, 2, 3]) }]);
  const entries = unzip(stored);
  assert.deepEqual(entries.map((e) => [e.name, e.size]), [["a.txt", hello.length], ["b/preview.png", 3]]);
  assert.deepEqual(await entries[1].read(), new Uint8Array([1, 2, 3]));

  // Rewrite the first entry as deflated: method 8 and the packed size, in both headers.
  const packed = new Uint8Array(await new Response(new Blob([hello]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
  const one = zip([{ name: "a.txt", data: packed }]);
  const v = new DataView(one.buffer);
  const cd = v.getUint32(one.length - 22 + 16, true);
  v.setUint16(8, 8, true);
  v.setUint16(cd + 10, 8, true);
  v.setUint32(cd + 24, hello.length, true);
  assert.deepEqual(await unzip(one)[0].read(), hello);
});

test("unzip finds nothing in bytes that aren't a zip", () => {
  assert.deepEqual(unzip(new Uint8Array(100)), []);
});
