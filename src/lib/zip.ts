/**
 * A minimal ZIP writer: stored entries, no compression. Assets are images and
 * already compressed, so deflate would spend CPU to save almost nothing.
 *
 * ponytail: no ZIP64, so the archive must stay under 4 GB and 65,535 entries,
 * and it is built in memory. Stream from the server if bulk downloads outgrow that.
 */

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const b of bytes) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type Entry = { name: string; data: Uint8Array; date?: Date };

/**
 * A name no extractor puts outside the folder it extracts to (zip slip): a
 * file name is anyone's upload. Folders stay; "..", ".", empty and drive
 * parts go, and a backslash separates like a slash.
 */
export const safeName = (name: string) =>
  name
    .split(/[\\/]+/)
    .filter((p) => p && p !== "." && p !== ".." && !/^[a-z]:$/i.test(p))
    .join("/") || "file";

/** "a.png", "a.png" -> "a.png", "a (2).png": a zip can't hold two of one name, as safeName has it. */
export function uniqueNames(names: string[]) {
  const used = new Set<string>();
  const last = new Map<string, number>();
  return names.map((raw) => {
    const name = safeName(raw);
    let n = last.get(name) ?? 1;
    let out = name;
    while (used.has(out)) out = name.replace(/(\.[^./]*)?$/, (ext) => ` (${++n})${ext}`);
    last.set(name, n);
    used.add(out);
    return out;
  });
}

export function zip(entries: Entry[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(safeName(e.name));
    const d = e.date ?? new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const crc = crc32(e.data);
    const size = e.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // names are UTF-8
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    locals.push(new Uint8Array(local.buffer), name, e.data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true); // version made by
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, name.length, true);
    // extra, comment, disk, internal and external attributes stay 0
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.length + size;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export type ZipEntry = { name: string; size: number; read: (limit?: number) => Promise<Uint8Array<ArrayBuffer>> };

/** The most an entry inflates to by default: a preview image is far less, a zip bomb far more. */
export const INFLATE_LIMIT = 64 * 1024 * 1024;

/**
 * A zip's entries, each read on demand. Stored and deflated entries, which is
 * every design file that is a zip (Sketch, XD, Keynote, pptx, .fig, dotLottie).
 * Corrupt input throws a RangeError, and so does an entry that inflates past
 * `limit` (or is stored larger): its declared size is the zip's say-so, so the bytes are counted.
 *
 * ponytail: no ZIP64, like the writer: previews sit in archives far under 4 GB.
 */
export function unzip(bytes: Uint8Array): ZipEntry[] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end record is the last 22 bytes, unless a comment (up to 64 KB) follows it.
  let end = bytes.length - 22;
  const floor = Math.max(0, end - 0xffff);
  while (end >= floor && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < floor) return [];

  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  let at = v.getUint32(end + 16, true);
  for (let i = v.getUint16(end + 10, true); i > 0 && v.getUint32(at, true) === 0x02014b50; i--) {
    const method = v.getUint16(at + 10, true);
    const packed = v.getUint32(at + 20, true);
    const size = v.getUint32(at + 24, true);
    const nameLength = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
    out.push({
      name,
      size,
      read: async (limit = INFLATE_LIMIT) => {
        // The local header's own name and extra lengths can differ from the central copy's.
        const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
        if (method === 0 && packed > limit) throw new RangeError(`${name}: more than ${limit} bytes`);
        const data = new Uint8Array(bytes.subarray(start, start + packed));
        if (method === 0) return data;
        if (method !== 8) throw new Error(`${name}: unsupported zip compression ${method}`);
        const inflated = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        const parts: Uint8Array<ArrayBuffer>[] = [];
        let total = 0;
        for await (const c of inflated as unknown as AsyncIterable<Uint8Array<ArrayBuffer>>) {
          total += c.length;
          if (total > limit) throw new RangeError(`${name}: more than ${limit} bytes inflated`);
          parts.push(c);
        }
        return new Uint8Array(await new Blob(parts).arrayBuffer());
      },
    });
  }
  return out;
}
