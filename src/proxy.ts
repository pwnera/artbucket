import { NextResponse, type NextRequest } from "next/server";
import { hostTarget, portalHome } from "@/lib/core/domains";
import { portalRedirect, underDomain } from "@/lib/portal";
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
/** BrandHub's host, when it has one of its own; on APP_URL's host it is only a path (app/hub). */
const hubHost = (() => {
  try {
    const h = process.env.HUB_URL ? new URL(process.env.HUB_URL).host : "";
    return h === appHost ? "" : h;
  } catch {
    return "";
  }
})();
const portalDomain = process.env.PORTAL_DOMAIN?.toLowerCase().replace(/\.$/, "");
const s3 = origin(process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT);
// Virtual-hosted buckets live at {bucket}.{host}: that is where a presigned PUT goes.
const bucket = s3 && process.env.S3_FORCE_PATH_STYLE === "false" ? s3.replace("://", `://${process.env.S3_BUCKET}.`) : "";

/**
 * Scripts: only those carrying this response's nonce, and what they load
 * ('strict-dynamic'). Next puts the nonce on its own scripts when it sees it
 * here (every page is rendered per request anyway: the root layout reads the
 * brand), and app/layout.tsx hands it to next-themes. So text that got into a
 * page some other way runs nothing. The Lottie player's WebAssembly, fetched
 * from jsDelivr (components/media.tsx). Frames: the Figma and Google embeds
 * (lib/preview.ts), and an embed section's hosts (lib/pages.ts EMBED_HOSTS).
 * Connections: browser uploads go straight to storage.
 */
const csp = (nonce: string) => [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
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

// Asset bytes, and the redirect to the current ones (app/a, app/c).
const bytes = (path: string) => path.startsWith("/a/") || path.startsWith("/c/");

// Per address. Not per Authorization header: nothing here knows whether it holds a key, so a new made-up one each time would be a new count.
const who = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";

/**
 * A request to a portal's host, a verified domain or a subdomain of
 * PORTAL_DOMAIN (lib/core/domains.ts), sees that portal and nothing else of
 * the app: every path is one of the portal's (/logo is /p/{slug}/logo), and
 * only what the portal page calls, /api and /a (and /c, which points at /a),
 * and robots.txt, which answers per host (app/robots.ts), pass through as is.
 *
 * A portal asked for anywhere but its home goes there, for good: /p/{slug} to
 * its subdomain or domain of its own, an address from before a rename to the
 * current one. A members portal stays at /p/ on the host asked: its members
 * sign in there.
 */
async function portalRoute(req: NextRequest, init?: { request: { headers: Headers } }) {
  const host = req.headers.get("host") ?? "";
  const { pathname, search } = req.nextUrl;
  const target = host && host !== appHost ? await hostTarget(host).catch(() => null) : null;
  const asked = target?.portal ?? null;
  // PORTAL_DOMAIN holds portals: at a name there that nothing holds, the domain itself too, nothing of the app answers.
  if (!target && host !== appHost && underDomain(host, portalDomain)) return new NextResponse("There is no portal here", { status: 404 });
  if (pathname.startsWith("/api/") || bytes(pathname) || pathname === "/robots.txt") return null;
  const onApp = asked ? null : pathname.match(/^\/p\/([^/]+)(\/.*)?$/);
  const slug = asked ?? onApp?.[1];
  if (!slug) return null;
  const rest = onApp ? (onApp[2] ?? "") : pathname === "/" ? "" : pathname;
  const home = await portalHome(slug).catch(() => null);
  const where = home && portalRedirect(home, asked ? { host, slug } : { slug });
  if (where) return new NextResponse(null, { status: 308, headers: { Location: `${where}${rest}${search}` } });
  if (!asked) return null;
  const url = req.nextUrl.clone();
  url.pathname = `/p/${asked}${rest}`;
  return NextResponse.rewrite(url, init);
}

/**
 * BrandHub on its own host: every path is one of app/hub's (/rust-lang is
 * /hub/rust-lang), but what its pages call, /api and asset bytes. /hub on the
 * app's host stays: people signed in read their private brands there.
 */
function hubRoute(req: NextRequest, onHub: boolean, init?: { request: { headers: Headers } }) {
  const { pathname } = req.nextUrl;
  if (!onHub) return null;
  if (/^\/(api|a|c)\//.test(pathname) || pathname === "/robots.txt") return null;
  const url = req.nextUrl.clone();
  url.pathname = `/hub${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url, init);
}

/**
 * The guidelines' old addresses, to the reader at /brands/{slug}/guidelines
 * with every other parameter: /brand?brand={slug}, the Guidelines tab's
 * /brands/{slug}/pages, and ?view=read (now ?focus=1). An HTTP redirect, so
 * a #rule- link keeps its hash, which a redirect made while the page streams
 * would drop. /brand alone, the default brand's, is app/(app)/brand's to
 * resolve; an editor's ?git= or ?panel= on the reader, the builder's
 * (app/(app)/brands/[slug]/guidelines).
 */
function movedGuidelines(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const slug = pathname === "/brand" && searchParams.get("brand");
  const tab = pathname.match(/^\/brands\/([^/]+)\/(pages|guidelines)$/);
  const reading = tab && (tab[2] === "pages" || searchParams.get("view") === "read");
  if (!slug && !reading) return null;
  const url = req.nextUrl.clone();
  url.pathname = `/brands/${slug ? encodeURIComponent(slug) : tab![1]}/guidelines`;
  url.searchParams.delete("brand");
  // The reader on its own, ?view=read on the builder's address, is ?focus=1 on the reader's.
  if (searchParams.get("view") === "read") {
    url.searchParams.delete("view");
    url.searchParams.set("focus", "1");
  }
  return NextResponse.redirect(url, 307);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const onHub = !!hubHost && req.headers.get("host") === hubHost;
  // The hub's pages are its API too (brand.json, tokens, llms.txt), so they count as /api does.
  if (RATE > 0 && (pathname.startsWith("/api/") || onHub)) {
    const wait = api.hit(who(req));
    if (wait) {
      return NextResponse.json(
        { error: { code: "rate_limited", message: `Too many requests: at most ${RATE} a minute. Try again in ${wait}s` } },
        { status: 429, headers: { "Retry-After": String(wait) } },
      );
    }
  }
  const page = !pathname.startsWith("/api/") && !bytes(pathname);
  // A page learns its own address (lib/sidebar.ts whoami): someone signed out goes to sign in, then back to it.
  const init = page ? { request: { headers: new Headers(req.headers) } } : undefined;
  init?.request.headers.set("x-path", pathname + req.nextUrl.search);
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const policy = csp(nonce);
  init?.request.headers.set("x-nonce", nonce);
  init?.request.headers.set("Content-Security-Policy", policy);
  const res = hubRoute(req, onHub, init) ?? (onHub ? null : await portalRoute(req, init)) ?? movedGuidelines(req) ?? NextResponse.next(init);
  if (https) res.headers.set("Strict-Transport-Security", "max-age=63072000");
  // The API answers JSON and /a/ answers bytes with a policy of its own (/c/ only redirects there); pages get the app's.
  if (page) res.headers.set("Content-Security-Policy", policy);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
