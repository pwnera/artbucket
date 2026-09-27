import { X509Certificate } from "node:crypto";

/**
 * C2PA Content Credentials, read on ingest: who made the file, with what,
 * and whether a model generated it. The manifest store is JUMBF boxes
 * (ISO 19566-5) holding CBOR; it lives in JPEG APP11 segments, a PNG caBX
 * chunk or a WebP C2PA chunk.
 *
 * The stored original is never touched, so the manifest is preserved as
 * signed: /a/{id} serves it byte for byte, and ?download leaves such a file
 * as it is (lib/core/assets.ts), since writing XMP in would break the hash
 * the manifest signs. Renditions are new pixels and carry none.
 *
 * ponytail: read, not verified. The signature, certificate chain and hash
 * binding are not checked, so `signedBy` is what the file claims. Verify with
 * c2pa-rs (c2pa-node) when a verdict has to rest on it.
 *
 * Pure, like lib/xmp.ts: `pnpm test` runs it under plain Node.
 */

export type C2pa = {
  /** Manifests in the store: one per signed step in the file's history. */
  manifests: number;
  /** The app that signed the active manifest, e.g. "Adobe Firefly 2.0". */
  generator: string | null;
  title: string | null;
  /** The signing certificate's organization, as the file claims it. Not verified. */
  signedBy: string | null;
  /** What was done, in order: c2pa.created, c2pa.edited, c2pa.opened. */
  actions: string[];
  /** IPTC's term for how it was made: digitalCapture, trainedAlgorithmicMedia... */
  digitalSourceType: string | null;
  /** The tool the actions name, when it differs from the signer: the model, often. */
  softwareAgent: string | null;
  /** Files it was made from. */
  ingredients: number;
};

/** IPTC digital source types that mean a model made it. */
const GENERATED = ["trainedAlgorithmicMedia", "compositeWithTrainedAlgorithmicMedia", "algorithmicMedia"];

/** What the credentials say about origin: `generated`, `shot`, or nothing. */
export function originOf(c: C2pa): "generated" | "shot" | null {
  if (c.digitalSourceType && GENERATED.includes(c.digitalSourceType)) return "generated";
  if (c.digitalSourceType === "digitalCapture") return "shot";
  return null;
}

/** The manifest's summary, or null when the file has none (or a store too broken to read). */
export function readC2pa(bytes: Buffer): C2pa | null {
  try {
    const store = manifestStore(bytes);
    return store ? summarize(store) : null;
  } catch {
    return null;
  }
}

// ---- finding the store ------------------------------------------------------

function manifestStore(b: Buffer): Buffer | null {
  if (b.length > 4 && b.readUInt16BE(0) === 0xffd8) return jpeg(b);
  if (b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return png(b);
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return webp(b);
  return null;
}

/**
 * APP11 segments: "JP", a box instance number, a sequence number, then the
 * box. A box too big for one segment continues in the next ones, each
 * repeating the box's 8-byte header, which is dropped when joining.
 */
function jpeg(b: Buffer): Buffer | null {
  const parts = new Map<number, Buffer[]>();
  let i = 2;
  while (i + 4 <= b.length) {
    const marker = b.readUInt16BE(i);
    if (marker === 0xffda || (marker & 0xff00) !== 0xff00) break;
    const end = i + 2 + b.readUInt16BE(i + 2);
    if (marker === 0xffeb && b.readUInt16BE(i + 4) === 0x4a50) {
      const en = b.readUInt16BE(i + 6);
      const seq = b.readUInt32BE(i + 8);
      const box = b.subarray(i + 12, end);
      const list = parts.get(en) ?? [];
      list.push(seq === 1 ? box : box.subarray(8));
      parts.set(en, list);
    }
    i = end;
  }
  for (const list of parts.values()) {
    const joined = Buffer.concat(list);
    if (labelOf(joined) === "c2pa") return joined;
  }
  return null;
}

function png(b: Buffer): Buffer | null {
  let i = 8;
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i);
    if (b.subarray(i + 4, i + 8).toString("latin1") === "caBX") return b.subarray(i + 8, i + 8 + len);
    i += 12 + len;
  }
  return null;
}

function webp(b: Buffer): Buffer | null {
  let i = 12;
  while (i + 8 <= b.length) {
    const len = b.readUInt32LE(i + 4);
    if (b.subarray(i, i + 4).toString("latin1") === "C2PA") return b.subarray(i + 8, i + 8 + len);
    i += 8 + len + (len % 2);
  }
  return null;
}

// ---- JUMBF ------------------------------------------------------------------

type Box = { type: string; data: Buffer };
/** A JUMBF superbox: its label, its content boxes, and the superboxes inside it. */
type Jumb = { label: string; content: Box[]; children: Jumb[] };

function boxes(b: Buffer): Box[] {
  const out: Box[] = [];
  let i = 0;
  while (i + 8 <= b.length) {
    let size = b.readUInt32BE(i);
    let header = 8;
    if (size === 1) {
      size = Number(b.readBigUInt64BE(i + 8));
      header = 16;
    } else if (size === 0) size = b.length - i;
    if (size < header || i + size > b.length) throw new Error("Truncated box");
    out.push({ type: b.subarray(i + 4, i + 8).toString("latin1"), data: b.subarray(i + header, i + size) });
    i += size;
  }
  return out;
}

/** A description box: a 16-byte type, toggles, then the label if toggle 2 is set. */
function describe(d: Buffer): string {
  if (!(d[16] & 0x02)) return "";
  const end = d.indexOf(0, 17);
  return d.subarray(17, end < 0 ? d.length : end).toString("utf8");
}

function jumb(data: Buffer): Jumb {
  const [desc, ...rest] = boxes(data);
  if (desc?.type !== "jumd") throw new Error("A superbox starts with its description");
  return {
    label: describe(desc.data),
    content: rest.filter((x) => x.type !== "jumb"),
    children: rest.filter((x) => x.type === "jumb").map((x) => jumb(x.data)),
  };
}

const labelOf = (b: Buffer) => {
  try {
    const [top] = boxes(b);
    return top?.type === "jumb" ? jumb(top.data).label : null;
  } catch {
    return null;
  }
};

const child = (j: Jumb | undefined, label: string) => j?.children.find((c) => c.label === label);
const cborOf = (j: Jumb | undefined) => {
  const box = j?.content.find((x) => x.type === "cbor");
  return box ? decodeCbor(box.data) : undefined;
};

// ---- the summary ------------------------------------------------------------

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) && !Buffer.isBuffer(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
/** { name, version } as "name version"; a bare string as itself. */
const named = (v: unknown) => {
  const o = obj(v);
  const name = str(v) ?? str(o.name);
  return name && str(o.version) ? `${name} ${str(o.version)}` : name;
};

function summarize(store: Buffer): C2pa | null {
  const [top] = boxes(store);
  if (top?.type !== "jumb") return null;
  const root = jumb(top.data);
  if (root.label !== "c2pa" || !root.children.length) return null;
  // The active manifest is the last one; the others are its history.
  const active = root.children[root.children.length - 1];
  const claim = obj(cborOf(child(active, "c2pa.claim.v2") ?? child(active, "c2pa.claim")));
  const assertions = child(active, "c2pa.assertions")?.children ?? [];
  const actions = assertions
    .filter((a) => a.label === "c2pa.actions" || a.label === "c2pa.actions.v2")
    .flatMap((a) => [obj(cborOf(a)).actions].flat())
    .map(obj);
  const info = claim.claim_generator_info;
  const source = actions.map((a) => str(a.digitalSourceType)).find(Boolean) ?? null;
  const agent = actions.map((a) => named(a.softwareAgent)).find(Boolean) ?? null;
  const generator = named(Array.isArray(info) ? info[0] : info) ?? str(claim.claim_generator);
  return {
    manifests: root.children.length,
    generator,
    title: str(claim["dc:title"]),
    signedBy: signer(cborOf(child(active, "c2pa.signature"))),
    actions: actions.map((a) => str(a.action)).filter((a): a is string => a !== null),
    digitalSourceType: source?.split("/").pop() ?? null,
    softwareAgent: agent && agent !== generator ? agent : null,
    ingredients: assertions.filter((a) => a.label.startsWith("c2pa.ingredient")).length,
  };
}

/**
 * COSE_Sign1 is [protected, unprotected, payload, signature]; the signer's
 * certificate is the first of `x5chain` (header 33), in either header map.
 */
function signer(cose: unknown): string | null {
  if (!Array.isArray(cose)) return null;
  const headers = [Buffer.isBuffer(cose[0]) && cose[0].length ? obj(decodeCbor(cose[0])) : {}, obj(cose[1])];
  const chain = headers.map((h) => h["33"]).find(Boolean);
  const der = Array.isArray(chain) ? chain[0] : chain;
  if (!Buffer.isBuffer(der)) return null;
  try {
    const subject = new X509Certificate(der).subject;
    // Distinguished names escape commas: "OpenAI OpCo\, LLC".
    const field = (k: string) => subject.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1].replace(/\\(.)/g, "$1") ?? null;
    return field("O") ?? field("CN");
  } catch {
    return null;
  }
}

// ---- CBOR -------------------------------------------------------------------

/**
 * RFC 8949, definite lengths, which is what C2PA writes. Maps come back as
 * objects keyed by the key as a string (COSE header 33 is "33"); byte
 * strings as Buffers; tags are dropped for the value they wrap.
 */
export function decodeCbor(b: Buffer): unknown {
  let i = 0;
  const take = (n: number) => {
    if (i + n > b.length) throw new Error("Truncated CBOR");
    const out = b.subarray(i, i + n);
    i += n;
    return out;
  };
  const arg = (info: number): number => {
    if (info < 24) return info;
    if (info === 24) return take(1)[0];
    if (info === 25) return take(2).readUInt16BE();
    if (info === 26) return take(4).readUInt32BE();
    if (info === 27) return Number(take(8).readBigUInt64BE());
    throw new Error("Indefinite or reserved CBOR length");
  };
  const half = (h: number) => {
    const exp = (h >> 10) & 0x1f;
    const frac = h & 0x3ff;
    const v = exp === 0 ? frac * 2 ** -24 : exp === 31 ? (frac ? NaN : Infinity) : (1 + frac / 1024) * 2 ** (exp - 15);
    return h & 0x8000 ? -v : v;
  };
  const item = (depth: number): unknown => {
    if (depth > 64) throw new Error("CBOR nested too deep");
    const head = take(1)[0];
    const major = head >> 5;
    const info = head & 0x1f;
    if (major === 7) {
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22) return null;
      if (info === 23) return undefined;
      if (info === 25) return half(take(2).readUInt16BE());
      if (info === 26) return take(4).readFloatBE();
      if (info === 27) return take(8).readDoubleBE();
      return arg(info);
    }
    const n = arg(info);
    // Every item is at least a byte: a count past the end is a lie, refused before allocating for it.
    if (major >= 2 && major <= 5 && n > b.length - i) throw new Error("Truncated CBOR");
    switch (major) {
      case 0:
        return n;
      case 1:
        return -1 - n;
      case 2:
        return Buffer.from(take(n));
      case 3:
        return take(n).toString("utf8");
      case 4:
        return Array.from({ length: n }, () => item(depth + 1));
      case 5: {
        const out: Record<string, unknown> = {};
        for (let k = 0; k < n; k++) {
          const key = String(item(depth + 1));
          out[key] = item(depth + 1);
        }
        return out;
      }
      default:
        return item(depth + 1); // a tag: keep what it wraps
    }
  };
  return item(0);
}
