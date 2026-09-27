import { fail, handle } from "@/lib/api";
import { downloadAsset, findAsset } from "@/lib/core/assets";
import { renderAsset } from "@/lib/core/renditions";
import { hasPreview } from "@/lib/preview";
import { getStream, originalKey } from "@/lib/storage";
import { parseTransform } from "@/lib/transform";

type Ctx = { params: Promise<{ id: string; transform?: string[] }> };

/**
 * GET /a/{id}                  → the original bytes, exactly as uploaded
 *                                (a `Range` gets part of them: video seeks)
 * GET /a/{id}?download         → the original with current metadata written in
 * GET /a/{id}/w_800,f_webp     → a rendition, generated once and cached
 *
 * The URL is the whole API. Nothing here needs a session, a download button, or
 * a prior round trip - an agent can build the URL it wants and fetch it. The
 * bytes are public to anyone holding the URL, so they can be embedded. What the
 * asset is and may be used for is API data, at /api/v1/assets/{id}/description.
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id, transform } = await params;

    const asset = await findAsset(id);
    if (!asset) return fail(404, "not_found", "No such asset");

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
      // Streamed from storage: a video is served without ever sitting in memory.
      const range = req.headers.get("range");
      if (range && /^bytes=\d*-\d*$/.test(range)) {
        const part = await getStream(originalKey(asset.sha256), range).catch(() => null);
        if (!part) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${asset.size}` } });
        return bytes(part.body, part.length, asset.mime, asset.filename, { status: 206, range: part.contentRange! });
      }
      const { body, length } = await getStream(originalKey(asset.sha256));
      return bytes(body, length, asset.mime, asset.filename);
    }

    if (transform.length > 1) return fail(400, "invalid_transform", "Malformed transform");

    const parsed = parseTransform(transform[0]);
    if (!parsed) return fail(400, "invalid_transform", "Malformed transform");
    if (!hasPreview(asset)) {
      return fail(415, "unsupported", `Cannot transform ${asset.mime}`);
    }

    const { body, length, contentType } = await renderAsset(asset, parsed);
    return bytes(body, length, contentType);
  } catch (err) {
    return handle(err);
  }
}

function bytes(
  body: BodyInit,
  length: number,
  contentType: string,
  filename?: string,
  part?: { status: 206; range: string },
) {
  return new Response(body, {
    status: part?.status ?? 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(length),
      // Immutable: the URL contains a content-derived id and a full transform.
      "Cache-Control": "public, max-age=31536000, immutable",
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
