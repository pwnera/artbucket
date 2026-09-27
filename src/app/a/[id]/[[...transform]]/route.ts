import { fail, handle } from "@/lib/api";
import { callerFrom } from "@/lib/core/access";
import { downloadAsset, findAsset, getAsset } from "@/lib/core/assets";
import { renderAsset } from "@/lib/core/renditions";
import { deliverable, maxAge, retired } from "@/lib/lifecycle";
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
 * bytes of an approved asset are public to anyone holding the URL, so they can
 * be embedded. What the asset is and may be used for is API data, at
 * /api/v1/assets/{id}/description.
 *
 * Only an approved, unexpired asset out of embargo is public (lib/lifecycle.ts).
 * Expired or archived, the URL answers 410 and every embed breaks on time;
 * a draft, a proposal or an embargoed asset is not there yet (404). Someone who
 * can see it in the library, by session or key, still gets it, uncached.
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id, transform } = await params;

    const asset = await findAsset(id);
    if (!asset) return fail(404, "not_found", "No such asset");
    const open = deliverable(asset);
    if (!open) {
      const caller = await callerFrom(req);
      if (!(caller && (await getAsset(caller, id)))) {
        // Unarchived, renewed or approved later, it is back: no cache may remember the refusal.
        const again = { "Cache-Control": "no-cache" };
        return retired(asset)
          ? fail(410, "gone", `${asset.state === "archived" ? "Archived" : "Expired"}: this asset is no longer in use`, undefined, again)
          : fail(404, "not_found", "No such asset", undefined, again);
      }
    }
    // The bytes behind a URL never change, so the hash names them; whether they may be served does.
    const etag = `"${asset.sha256}"`;
    const cache = open ? `public, max-age=${maxAge(asset)}` : "private, no-cache";

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

    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cache } });

    if (!transform?.length) {
      // Streamed from storage: a video is served without ever sitting in memory.
      const range = req.headers.get("range");
      if (range && /^bytes=\d*-\d*$/.test(range)) {
        const part = await getStream(originalKey(asset.sha256), range).catch(() => null);
        if (!part) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${asset.size}` } });
        return bytes(etag, cache, part.body, part.length, asset.mime, asset.filename, { status: 206, range: part.contentRange! });
      }
      const { body, length } = await getStream(originalKey(asset.sha256));
      return bytes(etag, cache, body, length, asset.mime, asset.filename);
    }

    if (transform.length > 1) return fail(400, "invalid_transform", "Malformed transform");

    const parsed = parseTransform(transform[0]);
    if (!parsed) return fail(400, "invalid_transform", "Malformed transform");
    if (!hasPreview(asset)) {
      return fail(415, "unsupported", `Cannot transform ${asset.mime}`);
    }

    const { body, length, contentType } = await renderAsset(asset, parsed);
    return bytes(etag, cache, body, length, contentType);
  } catch (err) {
    return handle(err);
  }
}

function bytes(
  etag: string,
  cache: string,
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
      // Not immutable: an archive or an expiry has to reach caches (lib/lifecycle.ts maxAge).
      "Cache-Control": cache,
      ETag: etag,
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
