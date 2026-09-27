import { authorize, fail, handle } from "@/lib/api";
import { describeAsset, downloadAsset, findAsset, getAsset } from "@/lib/core/assets";
import { renderAsset } from "@/lib/core/renditions";
import { hasPreview } from "@/lib/preview";
import { getObject, getRange, originalKey } from "@/lib/storage";
import { parseTransform } from "@/lib/transform";

type Ctx = { params: Promise<{ id: string; transform?: string[] }> };

/**
 * GET /a/{id}                  → the original bytes, exactly as uploaded
 *                                (a `Range` gets part of them: video seeks)
 * GET /a/{id}?download         → the original with current metadata written in
 * GET /a/{id}/w_800,f_webp     → a rendition, generated once and cached
 * GET /a/{id}  Accept: application/json
 *                              → the description: what it is, what it may be
 *                                rendered as, and (from v0.6) its rights
 *
 * The URL is the whole API. Nothing here needs a session, a download button, or
 * a prior round trip - an agent can build the URL it wants and fetch it. The
 * bytes are public to anyone holding the URL, so they can be embedded; the
 * description is API data and needs read on the asset.
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id, transform } = await params;

    const asset = await findAsset(id);
    if (!asset) return fail(404, "not_found", "No such asset");

    if (!transform?.length && wantsJson(req)) {
      const caller = await authorize(req, "asset.read");
      if (caller instanceof Response) return caller;
      const seen = await getAsset(caller, id);
      if (!seen) return fail(404, "not_found", "No such asset");
      return Response.json(describeAsset(seen), {
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
      const range = req.headers.get("range");
      if (range && /^bytes=\d*-\d*$/.test(range)) {
        const part = await getRange(originalKey(asset.sha256), range).catch(() => null);
        if (!part) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${asset.size}` } });
        return bytes(part.body, asset.mime, asset.filename, { status: 206, range: part.contentRange });
      }
      const body = await getObject(originalKey(asset.sha256));
      return bytes(body, asset.mime, asset.filename);
    }

    if (transform.length > 1) return fail(400, "invalid_transform", "Malformed transform");

    const parsed = parseTransform(transform[0]);
    if (!parsed) return fail(400, "invalid_transform", "Malformed transform");
    if (!hasPreview(asset)) {
      return fail(415, "unsupported", `Cannot transform ${asset.mime}`);
    }

    const { body, contentType } = await renderAsset(asset, parsed);
    return bytes(body, contentType);
  } catch (err) {
    return handle(err);
  }
}

function bytes(buf: Buffer, contentType: string, filename?: string, part?: { status: 206; range: string }) {
  return new Response(new Uint8Array(buf), {
    status: part?.status ?? 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buf.byteLength),
      // Immutable: the URL contains a content-derived id and a full transform.
      "Cache-Control": "public, max-age=31536000, immutable",
      // The same URL answers JSON to `Accept: application/json`; caches must not mix them.
      Vary: "Accept",
      // Public bytes: other sites may load them, which fonts (@font-face from brand/tokens) require.
      "Access-Control-Allow-Origin": "*",
      ...(filename ? { "Accept-Ranges": "bytes" } : {}),
      ...(part ? { "Content-Range": part.range } : {}),
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
