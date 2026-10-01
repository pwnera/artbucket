import { brotliDecompressSync, inflateSync } from "node:zlib";

/**
 * The license a font file names: its `name` table's license description
 * (name ID 13), else its license URL (14). An upload with no license of its
 * own takes this one, so a font says whether it may be handed out
 * (lib/rights.ts downloadable) without anyone filling it in. Google Fonts'
 * files name theirs, the open ones; a foundry's name its EULA.
 *
 * Reads TrueType and OpenType, WOFF and WOFF2. Server-side (node:zlib).
 */

/** Open licenses, as people know them, from what their text or address says. */
const KNOWN: [RegExp, string][] = [
  [/open font licen[cs]e|\bOFL\b|scripts\.sil\.org|openfontlicense\.org/i, "SIL Open Font License"],
  [/apache licen[cs]e|apache\.org\/licenses/i, "Apache License 2.0"],
  [/ubuntu font licen[cs]e/i, "Ubuntu Font License"],
];

export function fontLicense(bytes: Uint8Array): string | null {
  let text: string[];
  try {
    const name = nameTable(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    if (!name) return null;
    text = [13, 14].map((id) => nameString(Buffer.from(name), id)).filter((s): s is string => !!s);
  } catch {
    // Not a font after all, or a broken one: it names nothing.
    return null;
  }
  for (const [re, label] of KNOWN) if (text.some((t) => re.test(t))) return label;
  const said = text[0]?.replace(/\s+/g, " ").trim();
  if (!said) return null;
  // A EULA runs for pages: its first sentence, as the license field holds 200 characters.
  const first = said.match(/^.{1,200}?[.!?](?=\s|$)/)?.[0] ?? said;
  return first.length > 200 ? `${first.slice(0, 199).trimEnd()}…` : first;
}

/** The `name` table's bytes, uncompressed. */
function nameTable(b: Buffer): Uint8Array | null {
  const sig = b.toString("latin1", 0, 4);
  if (sig === "wOFF") {
    const n = b.readUInt16BE(12);
    for (let i = 0; i < n; i++) {
      const at = 44 + i * 20;
      if (b.toString("latin1", at, at + 4) !== "name") continue;
      const [offset, comp, orig] = [b.readUInt32BE(at + 4), b.readUInt32BE(at + 8), b.readUInt32BE(at + 12)];
      const raw = b.subarray(offset, offset + comp);
      return comp < orig ? inflateSync(raw) : raw;
    }
    return null;
  }
  if (sig === "wOF2") return woff2Name(b);
  if (sig === "OTTO" || sig === "true" || b.readUInt32BE(0) === 0x00010000) {
    const n = b.readUInt16BE(4);
    for (let i = 0; i < n; i++) {
      const at = 12 + i * 16;
      if (b.toString("latin1", at, at + 4) === "name") return b.subarray(b.readUInt32BE(at + 8), b.readUInt32BE(at + 8) + b.readUInt32BE(at + 12));
    }
  }
  return null;
}

/** WOFF2's known tags, by their index in a table entry's flags. Only `name`'s (5) and the transformed ones matter here. */
const GLYF = 10;
const LOCA = 11;
const HMTX = 3;
const NAME = 5;

/** WOFF2 keeps every table in one Brotli stream, in the directory's order, `name` never transformed. */
function woff2Name(b: Buffer): Uint8Array | null {
  // A collection's directory sits between the tables' and the stream: fonts we take are single faces.
  if (b.toString("latin1", 4, 8) === "ttcf") return null;
  const n = b.readUInt16BE(12);
  const compressed = b.readUInt32BE(20);
  let at = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const byte = b[at++];
      v = v * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return v;
    }
    throw new Error("Bad UIntBase128");
  };
  let start = 0;
  let found: { start: number; length: number } | null = null;
  for (let i = 0; i < n; i++) {
    const flags = b[at++];
    const index = flags & 0x3f;
    const tag = index === 63 ? b.toString("latin1", at, (at += 4)) : null;
    const version = flags >> 6;
    const length = base128();
    // glyf and loca are transformed at version 0, hmtx at 1; a transformed table says its stored length.
    const transformed = index === GLYF || index === LOCA ? version === 0 : index === HMTX ? version === 1 : version !== 0;
    const stored = transformed ? base128() : length;
    if (index === NAME || tag === "name") found = { start, length: stored };
    start += stored;
  }
  if (!found) return null;
  const stream = brotliDecompressSync(b.subarray(at, at + compressed));
  return stream.subarray(found.start, found.start + found.length);
}

/** One name's text, Windows or Unicode (UTF-16BE) first, else Mac Roman, which reads as Latin-1 for license text. */
function nameString(t: Buffer, id: number): string | null {
  const count = t.readUInt16BE(2);
  const strings = t.readUInt16BE(4);
  let mac: string | null = null;
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12;
    const [platform, , , nameId, length, offset] = [0, 2, 4, 6, 8, 10].map((o) => t.readUInt16BE(at + o));
    if (nameId !== id) continue;
    const raw = t.subarray(strings + offset, strings + offset + length);
    if (platform === 0 || platform === 3) return length % 2 ? null : Buffer.from(raw).swap16().toString("utf16le");
    if (platform === 1) mac ??= raw.toString("latin1");
  }
  return mac;
}
