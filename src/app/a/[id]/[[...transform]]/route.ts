import { authorize, fail, handle } from "@/lib/api";
import { describeAsset, downloadAsset, getAsset } from "@/lib/core/assets";
import { isRenderable, renderAsset } from "@/lib/core/renditions";
import { getObject, originalKey } from "@/lib/storage";
import { parseTransform } from "@/lib/transform";

type Ctx = { params: Promise<{ id: string; transform?: string[] }> };

/**
 * GET /a/{id}                  → the original bytes, exactly as uploaded
 * GET /a/{id}?download         → the original with current metadata written in
 * GET /a/{id}/w_800,f_webp     → a rendition, generated once and cached
 * GET /a/{id}  Accept: application/json
 *                              → the description: what it is, what it may be
 *                                rendered as, and (from v0.6) its rights
 *
 * The URL is the whole API. Nothing here needs a session, a download button, or
 * a prior round trip - an agent can build the URL it wants and fetch it. The
 * bytes are public to anyone holding the URL, so they can be embedded; the
 * description is API data and needs the read scope.
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id, transform } = await params;

    const asset = await getAsset(id);
    if (!asset) return fail(404, "not_found", "No such asset");

    if (!transform?.length && wantsJson(req)) {
      const caller = await authorize(req, "read");
      if (caller instanceof Response) return caller;
      return Response.json(describeAsset(asset), {
        headers: { "Cache-Control": "private, no-cache", Vary: "Accept" },
      });
    }

    if (!transform?.length && new URL(req.url).searchParams.has("download")) {
      const { body, embedded } = await downloadAsset(asset);
      return new Response(new Uint8Array(body), {
        headers: {
          "Content-Type": asset.mime,
          "Content-Length": String(body.byteLength),
          // Metadata is editable, so unlike every other byte here this changes.
          "Cache-Control": "private, no-cache",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,
          "X-Metadata-Embedded": String(embedded),
        },
      });
    }

    if (!transform?.length) {
      const body = await getObject(originalKey(asset.sha256));
      return bytes(body, asset.mime, asset.filename);
    }

    if (transform.length > 1) return fail(400, "invalid_transform", "Malformed transform");

    const parsed = parseTransform(transform[0]);
    if (!parsed) return fail(400, "invalid_transform", "Malformed transform");
    if (!isRenderable(asset.mime)) {
      return fail(415, "unsupported", `Cannot transform ${asset.mime}`);
    }

    const { body, contentType } = await renderAsset(asset, parsed);
    return bytes(body, contentType);
  } catch (err) {
    return handle(err);
  }
}

function bytes(buf: Buffer, contentType: string, filename?: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buf.byteLength),
      // Immutable: the URL contains a content-derived id and a full transform.
      "Cache-Control": "public, max-age=31536000, immutable",
      // The same URL answers JSON to `Accept: application/json`; caches must not mix them.
      Vary: "Accept",
      ...(filename
        ? { "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"` }
        : {}),
    },
  });
}

/**
 * JSON only when asked for by name. Browsers send wildcards and image types for
 * images and `text/html` for navigation, none of which should get JSON.
 */
const wantsJson = (req: Request) => /\bapplication\/json\b/.test(req.headers.get("accept") ?? "");
