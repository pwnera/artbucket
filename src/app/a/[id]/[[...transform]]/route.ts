import { fail, handle } from "@/lib/api";
import { callerFrom } from "@/lib/core/access";
import { validUntil } from "@/lib/core/signing";
import { downloadAsset, findAsset, getAsset } from "@/lib/core/assets";
import { renderAsset } from "@/lib/core/renditions";
import { countTraffic } from "@/lib/core/usage";
import { record, referrerOf, who } from "@/lib/core/events";
import type { Surface } from "@/lib/insights";
import { deliverable, maxAge, retired, STATE_LABEL } from "@/lib/lifecycle";
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
 * The URL is the whole API: an agent builds the URL it wants and fetches it,
 * with its key. The bytes are private: they go to whoever may see the asset
 * in the library, by session or key, following its permissions. Anyone else
 * needs a signed URL (?s=, lib/core/signing.ts), which share links and
 * portals hand out, or the asset made public, for embedding.
 *
 * Signed or public, only an approved, unexpired asset out of embargo leaves
 * (lib/lifecycle.ts). Expired or archived, the URL answers 410 and every
 * embed breaks on time; a draft, a proposal or an embargoed asset is not
 * there yet (404). Someone who can see it in the library still gets it.
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id, transform } = await params;

    const asset = await findAsset(id);
    if (!asset) return fail(404, "not_found", "No such asset");
    const url = new URL(req.url);
    const s = url.searchParams.get("s");
    const open = deliverable(asset);
    const until = open && !asset.public ? validUntil(asset.id, s) : null;
    let cache: string;
    // Who it went to, for Insights (lib/core/events.ts): a kind, never a name or an address.
    let by: { surface: Surface } & ReturnType<typeof who> = { surface: "public", ...who(null) };
    if (open && asset.public) cache = `public, max-age=${maxAge(asset)}`;
    // Cached with its query, so for no longer than the signature lasts.
    else if (until) {
      cache = `public, max-age=${Math.min(maxAge(asset), Math.floor((until.getTime() - Date.now()) / 1000))}`;
      by = { surface: "link", ...who(null) };
    } else {
      // In the asset's workspace: someone in several sees each one's assets, whichever they have open.
      const caller = await callerFrom(req, asset.workspaceId);
      if (!(caller && (await getAsset(caller, id)))) {
        // Made public, unarchived, renewed or approved later, it is back: no cache may remember the refusal.
        const again = { "Cache-Control": "no-cache" };
        if (retired(asset)) return fail(410, "gone", `${STATE_LABEL[asset.state]}: this asset is no longer in use`, undefined, again);
        if (open && s && Number(s.split(".")[0]) * 1000 <= Date.now()) return fail(410, "gone", "This link has expired", undefined, again);
        return fail(404, "not_found", "No such asset", undefined, again);
      }
      // ponytail: a session lookup per request, thumbnails included; the browser keeps them for maxAge.
      cache = open ? `private, max-age=${maxAge(asset)}` : "private, no-cache";
      by = { surface: caller.key ? "api" : "app", ...who(caller) };
    }
    // The bytes behind a URL never change, so the hash names them; whether they may be served does.
    const etag = `"${asset.sha256}"`;

    const download = !transform?.length && url.searchParams.has("download");
    const referrer = referrerOf(req);
    const range = req.headers.get("range");
    // The app drawing its own pages (thumbnails, previews) answers nobody's question, and a video's later ranges are one play.
    const counts = !(by.surface === "app" && referrer === url.hostname && !download) && !(range && !/^bytes=0-/.test(range));
    const served = (bytes: number) => {
      countTraffic(asset.workspaceId, bytes);
      if (counts) record({ workspaceId: asset.workspaceId, kind: "fetch", ...by, assetId: asset.id, version: asset.version, referrer });
    };

    if (download) {
      const { body, embedded } = await downloadAsset(asset);
      served(body.byteLength);
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

    if (req.headers.get("if-none-match") === etag) {
      served(0);
      return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cache } });
    }

    if (!transform?.length) {
      // Streamed from storage: a video is served without ever sitting in memory.
      if (range && /^bytes=\d*-\d*$/.test(range)) {
        const part = await getStream(originalKey(asset.sha256), range).catch(() => null);
        if (!part) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${asset.size}` } });
        served(part.length);
        return bytes(etag, cache, part.body, part.length, asset.mime, asset.filename, { status: 206, range: part.contentRange! });
      }
      const { body, length } = await getStream(originalKey(asset.sha256));
      served(length);
      return bytes(etag, cache, body, length, asset.mime, asset.filename);
    }

    if (transform.length > 1) return fail(400, "invalid_transform", "Malformed transform");

    const parsed = parseTransform(transform[0]);
    if (!parsed) return fail(400, "invalid_transform", "Malformed transform");
    if (!hasPreview(asset)) {
      return fail(415, "unsupported", `Cannot transform ${asset.mime}`);
    }

    const { body, length, contentType } = await renderAsset(asset, parsed);
    served(length);
    return bytes(etag, cache, body, length, contentType);
  } catch (err) {
    return handle(err);
  }
}

const SANDBOX = "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; font-src 'self' data:";

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
      // Other sites may load what they are allowed, which fonts (@font-face from brand/tokens) require. No credentials cross.
      "Access-Control-Allow-Origin": "*",
      // Anyone's upload, on this origin: an SVG or an HTML file opened here runs no script and reaches
      // nothing. Not on PDFs, which browsers show with a viewer that the sandbox would stop.
      ...(contentType === "application/pdf" ? {} : { "Content-Security-Policy": SANDBOX }),
      ...(filename ? { "Accept-Ranges": "bytes" } : {}),
      ...(part ? { "Content-Range": part.range } : {}),
      ...(filename
        ? { "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"` }
        : {}),
    },
  });
}
