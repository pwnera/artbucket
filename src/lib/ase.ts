import { type Cmyk, rgb } from "./color.ts";

/**
 * A palette as an Adobe Swatch Exchange file, which Illustrator, InDesign and
 * Photoshop import as swatches. All big-endian: "ASEF", version 1.0, the
 * number of blocks, then a block per swatch: type 0x0001, the length of what
 * follows, the name's length in UTF-16 units (its null included), the name,
 * the model ("RGB " or "CMYK"), each channel as a float32 from 0 to 1, and
 * the swatch type (0: global, so a change follows every use).
 *
 * A swatch with `cmyk` is written in CMYK, else in RGB from its hex.
 * ponytail: no groups; wrap swatches in 0xC001/0xC002 blocks when a palette's groups should travel too.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */
export function toAse(colors: { name: string; hex: string; cmyk?: Cmyk }[]): Uint8Array<ArrayBuffer> {
  const blocks = colors.map(({ name, hex, cmyk }) => {
    const values = cmyk ? cmyk.map((v) => v / 100) : rgb(hex).map((v) => v / 255);
    const length = 2 + (name.length + 1) * 2 + 4 + values.length * 4 + 2;
    const b = new DataView(new ArrayBuffer(6 + length));
    b.setUint16(0, 0x0001);
    b.setUint32(2, length);
    b.setUint16(6, name.length + 1);
    let at = 8;
    for (let i = 0; i < name.length; i++, at += 2) b.setUint16(at, name.charCodeAt(i));
    at += 2; // the null
    for (const c of cmyk ? "CMYK" : "RGB ") b.setUint8(at++, c.charCodeAt(0));
    for (const v of values) {
      b.setFloat32(at, v);
      at += 4;
    }
    b.setUint16(at, 0);
    return new Uint8Array(b.buffer);
  });
  const head = new DataView(new ArrayBuffer(12));
  [..."ASEF"].forEach((c, i) => head.setUint8(i, c.charCodeAt(0)));
  head.setUint16(4, 1);
  head.setUint16(6, 0);
  head.setUint32(8, blocks.length);
  const out = new Uint8Array(12 + blocks.reduce((n, b) => n + b.length, 0));
  out.set(new Uint8Array(head.buffer));
  blocks.reduce((at, b) => (out.set(b, at), at + b.length), 12);
  return out;
}
