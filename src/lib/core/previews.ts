import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { eq, sql } from "drizzle-orm";
import sharp, { type Sharp } from "sharp";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { fetchPublic } from "@/lib/fetch-public";
import { parseLink, RENDERABLE } from "@/lib/preview";
import { getObject, originalKey, previewKey, putObject } from "@/lib/storage";
import { INFLATE_LIMIT, unzip } from "@/lib/zip";

/**
 * Stills for files sharp can't read, derived once at upload and stored by
 * their own hash. Renditions are then made from the still (lib/core/renditions.ts),
 * so a PSD or a PDF gets every size and format an image does.
 *
 *   PDF, AI (PDF-compatible)    first page, via mupdf
 *   PSD, PSB                    the flattened composite, via ag-psd
 *   HEIC                        via libheif (sharp's prebuilt binaries lack HEVC)
 *   Word, PowerPoint, Excel,    first page, via LibreOffice when it is installed
 *   OpenDocument
 *   Sketch, XD, Keynote, pptx,  the preview image the app zipped in with it
 *   .fig, Procreate
 *   EPS                         its TIFF preview header
 *   video                       one frame, via ffmpeg when it is installed
 *   Figma, Google Docs,         the service's own thumbnail, for files shared
 *   Sheets, Slides, Drive       by link (they are kept as links)
 *   InDesign, AI, anything      a thumbnail in its XMP, the last resort
 *
 * Nothing can preview After Effects or Premiere projects: those show as their
 * type, next to the MP4 or Lottie rendered from them (parentAssetId).
 */

/**
 * What these extractors can do. Bump it when they learn a format, and the
 * backfill gives files looked at by an older version another look.
 */
const VERSION = 1;

/** What goes in `probe` for a file that isn't a web image. */
export type Probe = {
  /** The extractors' VERSION that looked at it. */
  previews: number;
  /** sha256 of the still, at previewKey(). */
  preview?: string;
  /** Plays as a Lottie animation. */
  lottie?: true;
  /** A link: shows as this iframe (lib/preview.ts parseLink). */
  embed?: string;
  /** A link's service: Figma, Docs, Sheets, Slides, Drawings, Drive. */
  service?: string;
  width?: number;
  height?: number;
};

/** The long edge of a stored still: enough for any rendition people ask for. */
const EDGE = 2048;

/**
 * Derive what the file can show as, storing the still. Never throws: a file
 * with no preview is still a perfectly good asset.
 */
export async function previewOf(bytes: Buffer, mime: string): Promise<Probe> {
  return { previews: VERSION, ...(await derive(bytes, mime)) };
}

async function derive(bytes: Buffer, mime: string): Promise<Omit<Probe, "previews">> {
  try {
    if (mime === "text/uri-list") return await link(bytes.toString("utf8").trim());
    if (isLottie(bytes, mime)) return { lottie: true };
    const found = await still(bytes, mime);
    if (!found) return {};
    return { preview: await store(found.image), ...found.size };
  } catch (err) {
    console.warn(`[artbucket] No preview for a ${mime} file:`, err instanceof Error ? err.message : err);
    return {};
  }
}

/**
 * Previews for files that aren't web images and that no extractor of this
 * VERSION has looked at: uploaded before previews existed, or before the
 * extractors learned their format. In the background at boot (instrumentation.ts);
 * each file is looked at once per VERSION, so a restart repeats no work.
 */
export async function backfillPreviews() {
  const rows = await db
    .select({ id: assets.id, sha256: assets.sha256, mime: assets.mime, probe: assets.probe })
    .from(assets)
    .where(
      sql`${assets.mime} !~ ${RENDERABLE.source} and coalesce((${assets.probe} ->> 'previews')::int, 0) < ${VERSION}`,
    );
  for (const r of rows) {
    try {
      const probe = { ...r.probe, ...(await previewOf(await getObject(originalKey(r.sha256)), r.mime)) };
      const size = probe.width && probe.height ? { width: probe.width, height: probe.height } : {};
      await db.update(assets).set({ probe, ...size }).where(eq(assets.id, r.id));
    } catch (err) {
      console.warn(`[artbucket] No preview for asset ${r.id}:`, err instanceof Error ? err.message : err);
    }
  }
}

/** Previews apps embed are often a little off spec (Illustrator's EPS TIFFs): decode what's there. */
const LENIENT = { failOn: "none" } as const;

type Still = { image: Sharp; size?: { width: number; height: number } };

async function still(bytes: Buffer, mime: string): Promise<Still | null> {
  const magic = bytes.subarray(0, 4).toString("latin1");
  if (magic === "%PDF") return pdf(bytes);
  if (magic === "8BPS") return (await psd(bytes)) ?? xmpThumbnail(bytes);
  // LibreOffice failing on a file is no reason to lose the thumbnail saved in it.
  if (magic === "PK\x03\x04") return (await office(bytes).catch(() => null)) ?? zipPreview(bytes);
  if (bytes.readUInt32BE(0) === 0xd0cf11e0) return office(bytes);
  if (bytes.readUInt32BE(0) === 0xc5d0d3c6) return eps(bytes) ?? xmpThumbnail(bytes);
  if (isHeic(bytes)) return heic(bytes);
  if (mime.startsWith("video/") || isVideo(bytes)) return video(bytes);
  return xmpThumbnail(bytes);
}

async function pdf(bytes: Buffer): Promise<Still> {
  const mupdf = await import("mupdf");
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const page = doc.loadPage(0);
    const [x0, y0, x1, y1] = page.getBounds();
    // Vector art renders at the size it will be shown at: no upscaled blur.
    const scale = Math.min(EDGE / Math.max(x1 - x0, y1 - y0), 8);
    // With alpha: a logo's transparent background stays transparent.
    const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, true, true);
    return { image: sharp(Buffer.from(pixmap.asPNG())) };
  } finally {
    doc.destroy();
  }
}

/** Photoshop saves the composite unless "Maximize compatibility" was turned off. */
async function psd(bytes: Buffer): Promise<Still | null> {
  const { initializeCanvas, readPsd } = await import("ag-psd");
  // Pixels only, no canvas: ag-psd allocates its 8-bit buffers through this.
  initializeCanvas(
    () => {
      throw new Error("No canvas on the server");
    },
    (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: "srgb" }),
  );
  // A header can claim any size: past 256 MB ag-psd refuses before allocating it.
  const file = readPsd(bytes, { skipLayerImageData: true, skipThumbnail: true, useImageData: true, totalMemoryLimit: 256 * 1024 * 1024 });
  const d = file.imageData;
  if (!d?.data.length) return null;
  const size = { width: d.width, height: d.height };
  return { image: sharp(d.data, { raw: { ...size, channels: 4 } }).toColourspace("srgb"), size };
}

async function heic(bytes: Buffer): Promise<Still> {
  const { default: decode } = await import("heic-decode");
  const { width, height, data } = await decode({ buffer: bytes });
  return { image: sharp(data, { raw: { width, height, channels: 4 } }), size: { width, height } };
}

/** The biggest preview or thumbnail image in the archive: Sketch, XD, Keynote, pptx, .fig, Procreate. */
async function zipPreview(bytes: Buffer): Promise<Still | null> {
  const [best] = unzip(bytes)
    .filter((e) => e.size <= INFLATE_LIMIT && /(^|\/)[^/]*(preview|thumbnail)[^/]*\.(png|jpe?g|webp)$/i.test(e.name))
    .sort((a, b) => b.size - a.size);
  return best ? { image: sharp(await best.read(), LENIENT) } : null;
}

/** A DOS EPS header points at an embedded TIFF preview, when the app wrote one. */
function eps(bytes: Buffer): Still | null {
  const at = bytes.readUInt32LE(20);
  const length = bytes.readUInt32LE(24);
  return length ? { image: sharp(bytes.subarray(at, at + length), LENIENT) } : null;
}

/**
 * Adobe apps write base64 JPEG thumbnails into XMP (xmpGImg:image): InDesign
 * always, Illustrator in AI and EPS. Small, but better than a file icon.
 */
function xmpThumbnail(bytes: Buffer): Still | null {
  let best: Buffer | null = null;
  for (let at = bytes.indexOf("<xmpGImg:image>"); at !== -1; at = bytes.indexOf("<xmpGImg:image>", at + 1)) {
    const end = bytes.indexOf("</xmpGImg:image>", at);
    if (end === -1) break;
    const b64 = bytes.subarray(at + 15, end).toString("latin1").replace(/&#xA;|\s/g, "");
    const jpeg = Buffer.from(b64, "base64");
    if (jpeg[0] === 0xff && jpeg[1] === 0xd8 && jpeg.length > (best?.length ?? 0)) best = jpeg;
  }
  return best && { image: sharp(best, LENIENT) };
}

const ftyp = (bytes: Buffer) => (bytes.toString("latin1", 4, 8) === "ftyp" ? bytes.toString("latin1", 8, 12) : null);
const isHeic = (bytes: Buffer) => /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ftyp(bytes) ?? "");
/** MP4 and MOV (ftyp), WebM and MKV (EBML), AVI (RIFF). */
const isVideo = (bytes: Buffer) =>
  ftyp(bytes) !== null || bytes.readUInt32BE(0) === 0x1a45dfa3 || bytes.toString("latin1", 8, 12) === "AVI ";

/**
 * A representative frame (ffmpeg's thumbnail filter, over the first few
 * seconds). Optional: without ffmpeg, video shows as its type.
 */
async function video(bytes: Buffer): Promise<Still | null> {
  // A file, not a pipe: an MP4 whose index is at the end can't be read from a stream.
  return inTemp(bytes, "video", async (input) => {
    const frame = await run(
      ["ffmpeg"],
      ["-v", "error", "-i", input, "-vf", "thumbnail", "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "-"],
      "videos will have no thumbnails",
    );
    if (!frame?.length) return null;
    const { width = 0, height = 0 } = await sharp(frame).metadata();
    return { image: sharp(frame), size: { width, height } };
  });
}

/**
 * Word, PowerPoint and Excel (and OpenDocument, and their pre-2007 binary
 * formats): the first page, as LibreOffice prints it to PDF. Optional: without
 * LibreOffice, a file shows the thumbnail its app saved in it, if any.
 *
 * ponytail: a LibreOffice start per upload, a few seconds each. Keep one
 * running (unoserver) if bulk imports of documents wait on it.
 */
async function office(bytes: Buffer): Promise<Still | null> {
  const ext = officeType(bytes);
  if (ext === null) return null;
  return inTemp(bytes, `document${ext}`, async (input, dir) => {
    const done = await run(
      ["soffice", "libreoffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice"],
      // Its own profile: two conversions at once would otherwise fight over one lock.
      ["--headless", `-env:UserInstallation=file://${dir}/profile`, "--convert-to", "pdf", "--outdir", dir, input],
      "Office documents will show only the thumbnail saved in them",
    );
    if (!done) return null;
    const page = await pdf(await readFile(join(dir, "document.pdf")));
    // A page is paper: LibreOffice leaves it transparent, which a tile would show through.
    return { image: page.image.flatten({ background: "#ffffff" }) };
  });
}

/** The extension LibreOffice should see, "" for a legacy binary file it sniffs itself, null for no document. */
function officeType(bytes: Buffer): string | null {
  if (bytes.readUInt32BE(0) === 0xd0cf11e0) return "";
  const names = new Set(unzip(bytes).map((e) => e.name));
  if (names.has("word/document.xml")) return ".docx";
  if (names.has("ppt/presentation.xml")) return ".pptx";
  if (names.has("xl/workbook.xml")) return ".xlsx";
  // OpenDocument says what it is in its first entry, stored uncompressed: "mimetype".
  const odf = /application\/vnd\.oasis\.opendocument\.(text|presentation|spreadsheet|graphics)/.exec(bytes.toString("latin1", 30, 120));
  return odf ? { text: ".odt", presentation: ".odp", spreadsheet: ".ods", graphics: ".odg" }[odf[1]]! : null;
}

/** Write the bytes to a temp file for a tool that wants a path, and clean up after. */
async function inTemp<T>(bytes: Buffer, name: string, work: (path: string, dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "artbucket-"));
  try {
    const path = join(dir, name);
    await writeFile(path, bytes);
    return await work(path, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const missing = new Set<string>();

/**
 * Run the first of `names` that is installed and return what it printed; null
 * when none is, said once in the log, with what goes without it.
 */
async function run(names: string[], args: string[], without: string): Promise<Buffer | null> {
  for (const name of names) {
    if (missing.has(name)) continue;
    try {
      const { stdout } = await promisify(execFile)(name, args, {
        encoding: "buffer",
        maxBuffer: 256 * 1024 * 1024,
        timeout: 120_000,
      });
      return stdout;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      missing.add(name);
      if (names.every((n) => missing.has(n))) console.warn(`[artbucket] ${names[0]} is not installed: ${without}.`);
    }
  }
  return null;
}

/** Lottie JSON (a version, a frame rate and layers), or a dotLottie zip (a manifest and animations). */
function isLottie(bytes: Buffer, mime: string) {
  if (bytes.subarray(0, 4).toString("latin1") === "PK\x03\x04") {
    const names = unzip(bytes).map((e) => e.name);
    return names.includes("manifest.json") && names.some((n) => n.startsWith("animations/"));
  }
  if (mime !== "application/json" || bytes.length > 64 * 1024 * 1024) return false;
  try {
    const j = JSON.parse(bytes.toString("utf8"));
    return typeof j?.v === "string" && typeof j.fr === "number" && Array.isArray(j.layers);
  } catch {
    return false;
  }
}

/**
 * A link: its service, an iframe to show it in, and a still where the service
 * gives one out (Figma's oEmbed, Google Drive's thumbnails), which both do only
 * for files shared by link. Private ones still embed for people signed in with access.
 */
async function link(url: string): Promise<Omit<Probe, "previews">> {
  const found = parseLink(url);
  if (!found) return {};
  const shown = { service: found.service, embed: found.embed };
  const thumbnail = found.drive
    ? `https://drive.google.com/thumbnail?id=${found.drive}&sz=w${EDGE}`
    : (await oembed(url))?.thumbnail_url;
  if (typeof thumbnail !== "string") return shown;
  try {
    const { bytes } = await fetchPublic(thumbnail, { maxBytes: 32 * 1024 * 1024 });
    return { ...shown, preview: await store(sharp(bytes)) };
  } catch {
    // A private Google file answers with a sign-in page, which isn't an image.
    return shown;
  }
}

/** The title a link's service gives it, to name the asset by. */
export async function linkTitle(url: string): Promise<string | null> {
  const found = parseLink(url);
  if (!found) return null;
  try {
    if (found.service === "Figma") {
      const title = (await oembed(url))?.title;
      return typeof title === "string" && title ? title : null;
    }
    // Shared by link, Google answers with a page titled "Name - Google Docs" (a no-break space in "Google Docs"); private, with a sign-in page.
    const { bytes } = await fetchPublic(found.embed, { maxBytes: 16 * 1024 * 1024 });
    const title = /<title>([^<]+?) - Google\s(?:Docs|Sheets|Slides|Drawings|Drive)<\/title>/.exec(bytes.toString("utf8"))?.[1];
    return title ? unescapeHtml(title) : null;
  } catch {
    return null;
  }
}

const unescapeHtml = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e as string]!);

async function oembed(url: string): Promise<Record<string, unknown> | null> {
  try {
    const { bytes } = await fetchPublic(`https://www.figma.com/api/oembed?url=${encodeURIComponent(url)}`, {
      maxBytes: 64 * 1024,
    });
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
}

/** Store a still as PNG, by its own hash. */
async function store(image: Sharp) {
  const png = await image.rotate().resize(EDGE, EDGE, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const sha = createHash("sha256").update(png).digest("hex");
  await putObject(previewKey(sha), png, "image/png");
  return sha;
}
