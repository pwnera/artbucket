import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gate } from "./pool.ts";

/**
 * Part of a PDF's page, cut out: what is drawn inside an area, as the vectors it is drawn with (an SVG of only what
 * lies there, the page's background and neighbours left out), or as a PNG when nothing there is vectors (a scan, a
 * flattened page). core/pdf-cut.ts makes it an asset.
 *
 * mupdf runs in a child process, as core/previews.ts runs it: a PDF is untrusted, and a bad one costs the child, not
 * the server. Relative imports only, so its test runs without the app.
 */

const CUT_MS = 30_000;
const cutting = gate(2);
/** Around the area asked for: what is mostly inside the padded area is kept, so an approximate box still finds it. */
const PAD = 0.02;

const CUTTER = String.raw`
const [, path, pageNo, l, t, r, b, pad] = process.argv;
const { readFileSync } = await import("node:fs");
const mupdf = await import("mupdf");
const doc = mupdf.Document.openDocument(readFileSync(path), "application/pdf");
const n = Number(pageNo);
if (n < 1 || n > doc.countPages()) { process.stdout.write(JSON.stringify({ error: "page" }) + "\n"); process.exit(0); }
const page = doc.loadPage(n - 1);
const [px0, py0, px1, py1] = page.getBounds();
const w = px1 - px0, h = py1 - py0, p = Number(pad);
const region = [px0 + (Number(l) - p) * w, py0 + (Number(t) - p) * h, px0 + (Number(r) + p) * w, py0 + (Number(b) + p) * h];
const area = (q) => Math.max(0, q[2] - q[0]) * Math.max(0, q[3] - q[1]);
const inter = (a, q) => [Math.max(a[0], q[0]), Math.max(a[1], q[1]), Math.min(a[2], q[2]), Math.min(a[3], q[3])];
// Pass 1: each drawing operation's bounds, in order. Kept: mostly inside the area, and no page-wide background.
const ops = [];
const unit = [0, 0, 1, 1];
// A stroke's own bounds, not mupdf's (which add the miter limit, so a ring looks far bigger than it is): the path's,
// grown by half the line's width as the page draws it.
const stroked = (b, stroke, ctm) => {
  const w = (stroke.getLineWidth?.() ?? 1) * Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) / 2;
  return [b[0] - w, b[1] - w, b[2] + w, b[3] + w];
};
const one = new mupdf.Device({
  fillPath(path, _e, ctm) { ops.push(path.getBounds(null, ctm)); },
  strokePath(path, stroke, ctm) { ops.push(stroked(path.getBounds(null, ctm), stroke, ctm)); },
  fillText(text, ctm) { ops.push(text.getBounds(null, ctm)); },
  strokeText(text, stroke, ctm) { ops.push(stroked(text.getBounds(null, ctm), stroke, ctm)); },
  fillShade(_s, ctm) { ops.push(region.slice()); },
  fillImage(_i, ctm) { ops.push(mupdf.Rect.transform(unit, ctm)); },
  fillImageMask(_i, ctm) { ops.push(mupdf.Rect.transform(unit, ctm)); },
});
page.run(one, mupdf.Matrix.identity);
one.close();
const keep = new Set();
let tight = null;
ops.forEach((q, i) => {
  const a = area(q);
  if (!a || area(inter(q, region)) / a < 0.7 || a > 4 * area(region)) return;
  keep.add(i);
  tight = tight ? [Math.min(tight[0], q[0]), Math.min(tight[1], q[1]), Math.max(tight[2], q[2]), Math.max(tight[3], q[3])] : q.slice();
});
if (!tight) { process.stdout.write(JSON.stringify({ error: "empty" }) + "\n"); process.exit(0); }
// A little air around it, so antialiasing at its edge isn't cut.
const air = Math.max(2, 0.02 * Math.max(tight[2] - tight[0], tight[3] - tight[1]));
const box = [tight[0] - air, tight[1] - air, tight[2] + air, tight[3] + air];
// Pass 2: only the kept operations, into an SVG the size of what they cover; clips and groups go through as they are.
const buf = new mupdf.Buffer();
const writer = new mupdf.DocumentWriter(buf, "svg", "text=path,no-reuse-images");
const dev = writer.beginPage(box);
let at = 0;
const draw = (name) => (...a) => { if (keep.has(at++)) dev[name](...a); };
const pass = (name) => (...a) => dev[name](...a);
const two = new mupdf.Device({
  fillPath: draw("fillPath"), strokePath: draw("strokePath"), fillText: draw("fillText"), strokeText: draw("strokeText"),
  fillShade: draw("fillShade"), fillImage: draw("fillImage"), fillImageMask: draw("fillImageMask"),
  clipPath: pass("clipPath"), clipStrokePath: pass("clipStrokePath"), clipText: pass("clipText"), clipStrokeText: pass("clipStrokeText"),
  clipImageMask: pass("clipImageMask"), popClip: pass("popClip"), beginMask: pass("beginMask"), endMask: pass("endMask"),
  beginGroup: pass("beginGroup"), endGroup: pass("endGroup"),
});
page.run(two, mupdf.Matrix.translate(-box[0], -box[1]));
two.close();
writer.endPage();
writer.close();
const svg = buf.asString();
// Mostly pictures (a scan): a PNG of the area reads better than an SVG wrapping a bitmap.
if (/<image\b/.test(svg) && (svg.match(/<path\b/g) ?? []).length < 3) {
  const scale = Math.min(4, 2048 / Math.max(box[2] - box[0], box[3] - box[1]));
  const pix = page.toPixmap(mupdf.Matrix.concat(mupdf.Matrix.translate(-box[0], -box[1]), mupdf.Matrix.scale(scale, scale)), mupdf.ColorSpace.DeviceRGB, true, true);
  const png = pix.asPNG();
  process.stdout.write(JSON.stringify({ png: true, box }) + "\n");
  process.stdout.write(Buffer.from(png.buffer, png.byteOffset, png.byteLength));
} else {
  process.stdout.write(JSON.stringify({ svg: true, box }) + "\n");
  process.stdout.write(svg);
}
`;

/** The area, as fractions of the page: left, top, right, bottom, from its top-left corner. */
export type Box = [number, number, number, number];

/** Why a page can't be cut: no such page, nothing drawn in the area, or the cutter failed or ran out of time. */
export class CutError extends Error {
  code: "page" | "empty" | "failed";
  constructor(code: "page" | "empty" | "failed", message: string) {
    super(message);
    this.name = "CutError";
    this.code = code;
  }
}

/** What a child sees of the server's environment: enough to run, none of its secrets. */
const childEnv = () => ({
  ...Object.fromEntries(["PATH", "LANG", "LC_ALL", "LC_CTYPE", "TZ"].flatMap((k) => (process.env[k] ? [[k, process.env[k]]] : []))),
  NODE_ENV: process.env.NODE_ENV,
  HOME: tmpdir(),
  TMPDIR: tmpdir(),
});

/**
 * An area of a PDF's page, cut: { svg, bytes } with the SVG's or the PNG's bytes. Throws a CutError when the page isn't
 * there, nothing is drawn in the area, or the cutter fails.
 */
export async function cutPage(bytes: Buffer, page: number, box: Box): Promise<{ svg: boolean; bytes: Buffer }> {
  const [l, t, r, b] = box;
  const out = await cutting
    .run(1, async () => {
      const dir = await mkdtemp(join(tmpdir(), "artbucket-cut-"));
      try {
        const path = join(dir, "in.pdf");
        await writeFile(path, bytes);
        const args = [
          "--input-type=module",
          "--max-old-space-size=512",
          "--wasm-max-mem-pages=16384",
          "-e",
          CUTTER,
          path,
          String(page),
          String(l),
          String(t),
          String(r),
          String(b),
          String(PAD),
        ];
        const { stdout } = await promisify(execFile)(process.execPath, args, {
          encoding: "buffer",
          maxBuffer: 64 * 1024 * 1024,
          timeout: CUT_MS,
          env: childEnv(),
        });
        return stdout;
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    })
    .catch((err: { killed?: boolean }) => {
      throw new CutError("failed", err.killed ? `Cutting the page took over ${CUT_MS / 1000}s` : "The page couldn't be cut");
    });
  const nl = out?.indexOf(0x0a) ?? -1;
  if (!out || nl === -1) throw new CutError("failed", "The page couldn't be cut");
  const meta = JSON.parse(out.toString("utf8", 0, nl)) as { svg?: true; png?: true; error?: "page" | "empty" };
  if (meta.error === "page") throw new CutError("page", `The PDF has no page ${page}`);
  if (meta.error === "empty") throw new CutError("empty", "Nothing is drawn in that area of the page");
  return { svg: !!meta.svg, bytes: out.subarray(nl + 1) };
}
