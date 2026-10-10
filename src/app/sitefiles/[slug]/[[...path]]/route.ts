import { handle } from "@/lib/api";
import { AssetError } from "@/lib/core/errors";
import { passOf } from "@/lib/core/portals";
import { siteFile } from "@/lib/core/sites";
import { getStream } from "@/lib/storage";

/**
 * A built site's files (lib/core/sites.ts), where src/proxy.ts sends a
 * request to a site's own address that a live build holds. Never reached on
 * the app's host: customer JavaScript runs only on the site's address. It may
 * not frame the app, nor be framed by anything else.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug, path = [] } = await params;
  const rest = `/${path.join("/")}${new URL(req.url).pathname.endsWith("/") && path.length ? "/" : ""}`;
  try {
    const f = await siteFile(slug, passOf(req), rest);
    if (!f) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    const { body, length } = await getStream(f.key);
    return new Response(body, {
      status: f.status,
      headers: {
        "Content-Type": f.contentType,
        "Content-Length": String(length),
        "Cache-Control": f.open ? "public, max-age=60" : "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "frame-ancestors 'self'",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
    });
  } catch (err) {
    // ponytail: a password or members site's builds wait for a cookie gate of their own; the managed portal asks at its door.
    if (err instanceof AssetError && err.code === "password") return new Response("This site isn't public: its builds answer once it is", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    return handle(err);
  }
}
