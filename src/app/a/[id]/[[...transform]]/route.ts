import { fail, handle } from "@/lib/api";
import { getAsset } from "@/lib/core/assets";
import { isRenderable, renderAsset } from "@/lib/core/renditions";
import { getObject, originalKey } from "@/lib/storage";
import { parseTransform } from "@/lib/transform";

type Ctx = { params: Promise<{ id: string; transform?: string[] }> };

/**
 * GET /a/{id}                  → the original bytes
 * GET /a/{id}/w_800,f_webp     → a rendition, generated once and cached
 *
 * The URL is the whole API. Nothing here needs a session, a download button, or
 * a prior round trip - an agent can build the URL it wants and fetch it.
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id, transform } = await params;

    const asset = await getAsset(id);
    if (!asset) return fail(404, "not_found", "No such asset");

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
      ...(filename
        ? { "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"` }
        : {}),
    },
  });
}
