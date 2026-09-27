import assert from "node:assert/strict";
import { crc32 } from "node:zlib";
import { test } from "node:test";
import { decodeCbor, originOf, readC2pa } from "./c2pa.ts";

// A tiny CBOR encoder and JUMBF builder, enough to write a manifest store the
// way c2pa-rs lays one out.

function cbor(v: unknown): Buffer {
  const head = (major: number, n: number) => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 256) return Buffer.from([(major << 5) | 24, n]);
    const b = Buffer.alloc(5);
    b[0] = (major << 5) | 26;
    b.writeUInt32BE(n, 1);
    return b;
  };
  if (typeof v === "number") return v < 0 ? head(1, -1 - v) : head(0, v);
  if (typeof v === "string") return Buffer.concat([head(3, Buffer.byteLength(v)), Buffer.from(v)]);
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(cbor)]);
  if (v === null) return Buffer.from([0xf6]);
  const entries = Object.entries(v as object);
  return Buffer.concat([head(5, entries.length), ...entries.flatMap(([k, x]) => [cbor(/^\d+$/.test(k) ? Number(k) : k), cbor(x)])]);
}

const box = (type: string, data: Buffer) => {
  const h = Buffer.alloc(8);
  h.writeUInt32BE(data.length + 8);
  h.write(type, 4, "latin1");
  return Buffer.concat([h, data]);
};
const jumd = (label: string) => box("jumd", Buffer.concat([Buffer.alloc(16), Buffer.from([0x03]), Buffer.from(`${label}\0`)]));
const jumb = (label: string, ...children: Buffer[]) => box("jumb", Buffer.concat([jumd(label), ...children]));

const firefly = (claimV2 = false) =>
  jumb(
    "c2pa",
    jumb("urn:uuid:older", jumb("c2pa.claim", box("cbor", cbor({ claim_generator: "old/1.0" })))),
    jumb(
      "urn:uuid:active",
      jumb(
        "c2pa.assertions",
        jumb(
          "c2pa.actions.v2",
          box(
            "cbor",
            cbor({
              actions: [
                {
                  action: "c2pa.created",
                  digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
                  softwareAgent: { name: "Firefly Image 3" },
                },
                { action: "c2pa.edited" },
              ],
            }),
          ),
        ),
        jumb("c2pa.ingredient.v3", box("cbor", cbor({ "dc:title": "sketch.png" }))),
        jumb("c2pa.hash.data", box("cbor", cbor({ alg: "sha256" }))),
      ),
      jumb(
        claimV2 ? "c2pa.claim.v2" : "c2pa.claim",
        box(
          "cbor",
          cbor(
            claimV2
              ? { claim_generator_info: { name: "Adobe Firefly", version: "2.0" }, "dc:title": "fox.jpg" }
              : { claim_generator: "Adobe_Firefly/2.0 c2pa-rs/0.30", "dc:title": "fox.jpg" },
          ),
        ),
      ),
      jumb("c2pa.signature", box("cbor", cbor([cbor({ 1: -7 }), {}, null, Buffer.alloc(64)]))),
    ),
  );

/** A JPEG with the store split across APP11 segments of at most `chunk` bytes. */
function jpegWith(store: Buffer, chunk = 100) {
  const segs: Buffer[] = [];
  const header = store.subarray(0, 8);
  for (let off = 0, seq = 1; off < store.length; off += chunk, seq++) {
    const part = store.subarray(off, off + chunk);
    const payload = Buffer.concat([Buffer.from("JP"), Buffer.from([0, 1]), Buffer.alloc(4), seq === 1 ? Buffer.alloc(0) : header, part]);
    payload.writeUInt32BE(seq, 4);
    const seg = Buffer.alloc(4);
    seg.writeUInt16BE(0xffeb);
    seg.writeUInt16BE(payload.length + 2, 2);
    segs.push(seg, payload);
  }
  return Buffer.concat([Buffer.from([0xff, 0xd8]), ...segs, Buffer.from([0xff, 0xda, 0, 2]), Buffer.from([1, 2, 3])]);
}

function pngWith(store: Buffer) {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])));
    return Buffer.concat([len, Buffer.from(type), data, crc]);
  };
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", Buffer.alloc(13)),
    chunk("caBX", store),
    chunk("IDAT", Buffer.alloc(4)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const expected = {
  manifests: 2,
  generator: "Adobe_Firefly/2.0 c2pa-rs/0.30",
  title: "fox.jpg",
  signedBy: null,
  actions: ["c2pa.created", "c2pa.edited"],
  digitalSourceType: "trainedAlgorithmicMedia",
  softwareAgent: "Firefly Image 3",
  ingredients: 1,
};

test("reads the active manifest from JPEG APP11 segments, joined across continuations", () => {
  assert.deepEqual(readC2pa(jpegWith(firefly())), expected);
  assert.deepEqual(readC2pa(jpegWith(firefly(), 10_000)), expected, "in one segment too");
});

test("reads a PNG caBX chunk, and a v2 claim's generator info", () => {
  assert.deepEqual(readC2pa(pngWith(firefly(true))), { ...expected, generator: "Adobe Firefly 2.0" });
});

test("files without credentials, and broken stores, read as none", () => {
  assert.equal(readC2pa(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2])), null);
  assert.equal(readC2pa(Buffer.from("hello")), null);
  const broken = firefly();
  assert.equal(readC2pa(pngWith(broken.subarray(0, broken.length - 20))), null);
});

test("a generated file's origin is generated; a camera's is shot", () => {
  assert.equal(originOf(readC2pa(jpegWith(firefly()))!), "generated");
  assert.equal(originOf({ ...expected, digitalSourceType: "digitalCapture" }), "shot");
  assert.equal(originOf({ ...expected, digitalSourceType: null }), null);
});

test("CBOR: numbers, floats, tags and lies about length", () => {
  assert.deepEqual(decodeCbor(cbor({ a: [1, -2, "x"], 33: Buffer.from([1]) })), { a: [1, -2, "x"], 33: Buffer.from([1]) });
  assert.equal(decodeCbor(Buffer.from([0xf9, 0x3c, 0x00])), 1); // half-precision 1.0
  assert.equal(decodeCbor(Buffer.from([0xd2, 0x01])), 1); // tag 18 around 1
  assert.throws(() => decodeCbor(Buffer.from([0x9a, 0xff, 0xff, 0xff, 0xff])), /Truncated/);
});
