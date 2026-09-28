import assert from "node:assert/strict";
import { test } from "node:test";
import { toAse } from "./ase.ts";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

// The bytes of the documented ASE layout, written out by hand, as Adobe's apps read them.
test("an RGB and a CMYK swatch, byte for byte", () => {
  const got = toAse([
    { name: "Red", hex: "#ff0000" },
    { name: "Ink", hex: "#1d1d1d", cmyk: [0, 0, 0, 100] },
  ]);
  const want = [
    "41534546", // ASEF
    "0001 0000", // version 1.0
    "00000002", // two blocks
    // A color entry of 28 bytes: "Red" and its null, RGB, 1 0 0, global.
    "0001 0000001c",
    "0004 0052 0065 0064 0000",
    "52474220",
    "3f800000 00000000 00000000",
    "0000",
    // 32 bytes: "Ink", CMYK from the book, not from its hex.
    "0001 00000020",
    "0004 0049 006e 006b 0000",
    "434d594b",
    "00000000 00000000 00000000 3f800000",
    "0000",
  ]
    .join("")
    .replace(/\s/g, "");
  assert.equal(hex(got), want);
});

test("names are UTF-16, so accents and non-Latin names survive", () => {
  const got = toAse([{ name: "Café", hex: "#000000" }]);
  // Name length 5 (four letters and the null), é as 00e9; the block 30 bytes long.
  assert.ok(hex(got).startsWith("41534546" + "00010000" + "00000001" + "0001" + "0000001e" + "0005" + "004300610066" + "00e9" + "0000"));
  assert.equal(got.length, 12 + 6 + 30);
  assert.equal(hex(toAse([])), "41534546" + "00010000" + "00000000");
});
