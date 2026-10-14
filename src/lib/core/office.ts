import { createHash } from "node:crypto";
import { findAsset } from "@/lib/core/assets";
import { AssetError } from "@/lib/core/errors";
import { publishedSource, type BrandSource } from "@/lib/core/page-view";
import { renderAsset } from "@/lib/core/renditions";
import { fileSlug } from "@/lib/branding";
import { disposition } from "@/lib/filename";
import { deliverable } from "@/lib/lifecycle";
import { OFFICE_FORMATS, officeLook, type OfficeFormat } from "@/lib/office";
import { hasPreview } from "@/lib/preview";
import { isDownloadable } from "@/lib/rights";

/**
 * A release as an Office template (lib/office.ts): its look, and its logo as
 * a PNG when the file may leave the team (lib/rights.ts) and is usable now,
 * as a portal's download would have it. The logo's PNG is a rendition, kept
 * once made (lib/core/renditions.ts); the rest is a few kilobytes of text,
 * written per request in less time than a read from the bucket. One release
 * is one file byte for byte (its times are the release's), so its ETag holds
 * until the release, or whether its logo may leave, changes.
 */
export async function officeTemplate(src: BrandSource, format: OfficeFormat) {
  const look = officeLook(src.brand.name, src.rules, src.theme);
  const logo = await logoPng(src.projectId, look.logo);
  const f = OFFICE_FORMATS[format];
  const published = src.version?.publishedAt;
  const bytes = f.build(look, logo, published ? new Date(published) : undefined);
  const release = src.version ? `-v${src.version.number}` : "";
  return {
    bytes,
    mime: f.mime,
    filename: `${fileSlug(src.brand.name)}${release}.${format}`,
    etag: `"${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}"`,
  };
}

/** The first of the logo's files this project has, usable and free to leave, drawn as a PNG up to 1600 by 400. */
async function logoPng(projectId: string, ids: string[]) {
  for (const id of ids) {
    const a = await findAsset(id);
    if (!a || a.projectId !== projectId || !deliverable(a) || !isDownloadable(a) || !hasPreview(a)) continue;
    try {
      const { body } = await renderAsset(a, { w: 1600, h: 400, fit: "inside", f: "png" });
      return new Uint8Array(await new Response(body).arrayBuffer());
    } catch (err) {
      // A logo that can't be drawn leaves the template without one, not the reader without a template.
      console.warn(err);
    }
  }
  return null;
}

/**
 * GET /api/v1/brand/office: a brand's release as a template, `live` the one
 * readers see. One edited and never released has none (404); one with no
 * history at all reads as it stands, as its portals show it.
 */
export async function releasedOffice(ws: string, slug: string | undefined, version: "live" | number, format: OfficeFormat) {
  const src = await publishedSource(ws, slug, version === "live" ? undefined : version);
  if (!src) throw new AssetError("not_found", version === "live" ? "That brand isn't released yet" : `Version ${version} was never released`);
  return officeTemplate(src, format);
}

/** The template as a download, a 304 when the reader has these bytes already. */
export function officeResponse(req: Request, t: { bytes: Uint8Array<ArrayBuffer>; mime: string; filename: string; etag: string }) {
  // Revalidated each time: the bytes hold for the release, but whether its logo may leave can change.
  const headers = { ETag: t.etag, "Cache-Control": "private, no-cache" };
  if (req.headers.get("if-none-match") === t.etag) return new Response(null, { status: 304, headers });
  return new Response(t.bytes, { headers: { ...headers, "Content-Type": t.mime, "Content-Disposition": disposition("attachment", t.filename) } });
}
