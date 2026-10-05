import { fail, handle } from "@/lib/api";
import { callerFrom } from "@/lib/core/access";
import { findAsset, getAsset } from "@/lib/core/assets";
import { suspendedIn } from "@/lib/core/suspension";
import { latestVersion } from "@/lib/core/versions";
import { followPath } from "@/lib/follow";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /c/{id}                  → 302 to /a/{current id}
 * GET /c/{id}/w_800,f_webp     → 302 to /a/{current id}/w_800,f_webp
 *
 * The URL to embed when it should follow the asset: a new version approved,
 * a rollback, a replacement a person named (lib/core/versions.ts
 * latestVersion). /a/{id} stays pinned to its bytes; this only points at it,
 * for a minute, so a change reaches every embed within one.
 *
 * Whoever may see {id} is sent on: anyone when it is public, else people who
 * see it in the library. The asset it lands on answers as /a always does, so
 * a public embed keeps working only while the current version is public too.
 * No `?s=`: a signature pins one id, so a signed URL is an /a URL.
 *
 * Not recorded for Insights: the /a fetch it sends to is, as the current
 * version, which is what release adoption asks. Counting both would count
 * each fetch twice.
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const asset = await findAsset(id);
    const nope = () => fail(404, "not_found", "No such asset", undefined, { "Cache-Control": "no-cache" });
    if (!asset) return nope();
    let cache = "public, max-age=60";
    // A suspended organization's files go to its own people only (lib/suspension.ts).
    const off = await suspendedIn(asset.workspaceId);
    if (!asset.public || off) {
      const caller = await callerFrom(req, asset.workspaceId);
      if (!(caller && (await getAsset(caller, id)))) {
        return off ? fail(451, "suspended", "This content is unavailable", undefined, { "Cache-Control": "no-store" }) : nope();
      }
      cache = "private, max-age=60";
    }
    const to = await latestVersion(asset);
    return new Response(null, { status: 302, headers: { Location: followPath(req.url, to.id), "Cache-Control": cache } });
  } catch (err) {
    return handle(err);
  }
}
