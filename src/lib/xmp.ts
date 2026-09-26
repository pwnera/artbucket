import { crc32 } from "node:zlib";

/**
 * Write-back: the library's metadata goes into the file on download, so leaving
 * artbucket costs nothing. The XMP packet is spliced in without re-encoding a
 * single pixel; the stored original is never touched.
 *
 * ponytail: the packet replaces any XMP already in the file, so tool-specific
 * XMP (Lightroom develop settings, say) is absent from the downloaded copy. The
 * stored original keeps it. Merge packets if someone round-trips through an
 * editor and misses it. JPEG and PNG only; add WebP/TIFF when asked.
 *
 * ponytail: EXIF and IPTC are left as they are. XMP takes precedence in every
 * mainstream reader, so an edited field wins, but a field cleared in the library
 * still shows its old EXIF/IPTC value. Rewrite those blocks if that bites.
 */

export type WriteBack = {
  title?: string;
  description?: string;
  creator?: string;
  copyright?: string;
  tags: string[];
};

const XMP_NS = "http://ns.adobe.com/xap/1.0/\0";
const PNG_KEYWORD = "XML:com.adobe.xmp";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const alt = (v?: string) =>
  v ? `<rdf:Alt><rdf:li xml:lang="x-default">${esc(v)}</rdf:li></rdf:Alt>` : "";

export function buildXmp(m: WriteBack): string {
  const props = [
    m.title && `<dc:title>${alt(m.title)}</dc:title>`,
    m.description && `<dc:description>${alt(m.description)}</dc:description>`,
    m.creator && `<dc:creator><rdf:Seq><rdf:li>${esc(m.creator)}</rdf:li></rdf:Seq></dc:creator>`,
    m.copyright && `<dc:rights>${alt(m.copyright)}</dc:rights>`,
    m.tags.length &&
      `<dc:subject><rdf:Bag>${m.tags.map((t) => `<rdf:li>${esc(t)}</rdf:li>`).join("")}</rdf:Bag></dc:subject>`,
  ].filter(Boolean);
  return (
    `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">${props.join("")}</rdf:Description>` +
    `</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`
  );
}

/** Returns the file with `xmp` embedded, or null for a format we can't write. */
export function embedXmp(bytes: Buffer, mime: string, xmp: string): Buffer | null {
  try {
    if (mime === "image/jpeg") return jpeg(bytes, xmp);
    if (mime === "image/png") return png(bytes, xmp);
  } catch {
    // Malformed file: serve it as stored rather than fail the download.
  }
  return null;
}

/**
 * JPEG is a run of marker segments before the scan. Drop any existing XMP APP1
 * and put ours after the leading APP0/APP1 (JFIF, EXIF), where readers expect it.
 */
function jpeg(bytes: Buffer, xmp: string): Buffer | null {
  if (bytes.readUInt16BE(0) !== 0xffd8) return null;
  const payload = Buffer.concat([Buffer.from(XMP_NS, "latin1"), Buffer.from(xmp, "utf8")]);
  if (payload.length > 0xffff - 2) return null; // one segment's worth; extended XMP not supported

  const keep: Buffer[] = [];
  let insertAt = 0;
  let i = 2;
  while (i + 4 <= bytes.length) {
    const marker = bytes.readUInt16BE(i);
    if (marker === 0xffda || (marker & 0xff00) !== 0xff00) break; // start of scan: the rest is image data
    const end = i + 2 + bytes.readUInt16BE(i + 2);
    const seg = bytes.subarray(i, end);
    const isXmp = marker === 0xffe1 && seg.subarray(4, 4 + XMP_NS.length).toString("latin1") === XMP_NS;
    if (!isXmp) {
      keep.push(seg);
      if ((marker === 0xffe0 || marker === 0xffe1) && insertAt === keep.length - 1) insertAt = keep.length;
    }
    i = end;
  }

  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(payload.length + 2, 2);
  keep.splice(insertAt, 0, Buffer.concat([header, payload]));
  return Buffer.concat([bytes.subarray(0, 2), ...keep, bytes.subarray(i)]);
}

/** PNG carries XMP in an iTXt chunk; ours goes before the first IDAT. */
function png(bytes: Buffer, xmp: string): Buffer | null {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  const data = Buffer.concat([Buffer.from(`${PNG_KEYWORD}\0\0\0\0\0`, "latin1"), Buffer.from(xmp, "utf8")]);
  const type = Buffer.from("iTXt", "latin1");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  const chunk = Buffer.concat([len, type, data, crc]);

  const out: Buffer[] = [bytes.subarray(0, 8)];
  let placed = false;
  let i = 8;
  while (i + 8 <= bytes.length) {
    const end = i + 12 + bytes.readUInt32BE(i);
    const kind = bytes.subarray(i + 4, i + 8).toString("latin1");
    const isXmp =
      kind === "iTXt" && bytes.subarray(i + 8, i + 8 + PNG_KEYWORD.length + 1).toString("latin1") === `${PNG_KEYWORD}\0`;
    if (kind === "IDAT" && !placed) {
      out.push(chunk);
      placed = true;
    }
    if (!isXmp) out.push(bytes.subarray(i, end));
    i = end;
  }
  return placed ? Buffer.concat(out) : null;
}
