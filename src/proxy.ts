import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { portalAtHost } from "@/lib/core/domains";
import { limiter } from "@/lib/rate";

/**
 * In front of every request: a rate limit on /api, the headers that depend
 * on how the server is configured, which next.config.ts can't know at build
 * time (one image runs anywhere), and brand portals on their own domains. The
 * static headers are in next.config.ts.
 *
 * Reads process.env itself rather than lib/env.ts: this runs on every
 * request, and needs three strings.
 */

const RATE = Number(process.env.RATE_LIMIT ?? 1200);
const api = limiter(RATE, 60_000);

const origin = (url: string | undefined) => {
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
};
const https = process.env.APP_URL?.startsWith("https:");
const app = origin(process.env.APP_URL);
const appHost = (() => {
  try {
    return new URL(process.env.APP_URL ?? "http://localhost:3000").host;
  } catch {
    return "";
  }
})();
const s3 = origin(process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT);
// Virtual-hosted buckets live at {bucket}.{host}: that is where a presigned PUT goes.
const bucket = s3 && process.env.S3_FORCE_PATH_STYLE === "false" ? s3.replace("://", `://${process.env.S3_BUCKET}.`) : "";

/**
 * Scripts: Next's inline bootstrap needs 'unsafe-inline' without nonces, which
 * would make every page dynamic; the Lottie player's WebAssembly, fetched from
 * jsDelivr (components/media.tsx). Frames: the Figma and Google embeds
 * (lib/preview.ts), and an embed section's hosts (lib/pages.ts EMBED_HOSTS).
 * Connections: browser uploads go straight to storage.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // The app's own address too: on an organization's domain, asset URLs from the API still point at APP_URL.
  `img-src 'self' data: blob: ${app}`.trim(),
  `media-src 'self' blob: ${app}`.trim(),
  `connect-src 'self' ${s3} ${bucket} https://cdn.jsdelivr.net`.replace(/\s+/g, " ").trim(),
  "frame-src https://www.figma.com https://docs.google.com https://drive.google.com https://embed.figma.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const who = (req: NextRequest) => {
  const auth = req.headers.get("authorization");
  if (auth) return `k:${createHash("sha256").update(auth).digest("base64url").slice(0, 22)}`;
  return `ip:${req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown"}`;
};

/**
 * A request to a verified portal domain (lib/core/domains.ts) sees that
 * portal and nothing else of the app: every path is one of the portal's
 * (/logo is /p/{slug}/logo), and only what the portal page calls, /api and
 * /a, and robots.txt, which answers per host (app/robots.ts), pass through as is.
 */
async function portalRewrite(req: NextRequest, init?: { request: { headers: Headers } }) {
  const host = req.headers.get("host") ?? "";
  if (!host || host === appHost) return null;
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/") || pathname.startsWith("/a/") || pathname === "/robots.txt") return null;
  const slug = await portalAtHost(host).catch(() => null);
  if (!slug) return null;
  const url = req.nextUrl.clone();
  url.pathname = `/p/${slug}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url, init);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (RATE > 0 && pathname.startsWith("/api/")) {
    const wait = api.hit(who(req));
    if (wait) {
      return NextResponse.json(
        { error: { code: "rate_limited", message: `Too many requests: at most ${RATE} a minute. Try again in ${wait}s` } },
        { status: 429, headers: { "Retry-After": String(wait) } },
      );
    }
  }
  const page = !pathname.startsWith("/api/") && !pathname.startsWith("/a/");
  // A page learns its own address (lib/sidebar.ts whoami): someone signed out goes to sign in, then back to it.
  const init = page ? { request: { headers: new Headers(req.headers) } } : undefined;
  init?.request.headers.set("x-path", pathname + req.nextUrl.search);
  const res = (await portalRewrite(req, init)) ?? NextResponse.next(init);
  if (https) res.headers.set("Strict-Transport-Security", "max-age=63072000");
  // The API answers JSON and /a/ answers bytes with a policy of its own; pages get the app's.
  if (page) res.headers.set("Content-Security-Policy", CSP);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
