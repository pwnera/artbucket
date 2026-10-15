import { handle } from "@/lib/api";
import { AssetError } from "@/lib/core/errors";
import { enterPortal, passOf } from "@/lib/core/portals";
import { keyDoor, letIn, MEMBER_HOURS, membersDoor, siteFile, UNLOCK_DAYS, unlockValue } from "@/lib/core/sites";
import { ENTER_PATH, FRAMED_HEADER, unlockCookie } from "@/lib/sites";
import { localPath } from "@/lib/markdown";
import { siteHeaders } from "@/lib/site-serve";
import { env } from "@/lib/env";
import { getStream } from "@/lib/storage";

/**
 * A built site's files (lib/core/sites.ts), where src/proxy.ts sends a
 * request to a site's own address that a live build holds. Never reached on
 * the app's host: customer JavaScript runs only on the site's address. It may
 * not frame the app, nor be framed by anything else.
 */

type Params = { params: Promise<{ slug: string; path?: string[] }> };

/** The address asked, as the visitor sent it (this one is the proxy's rewrite). */
async function asked(req: Request, { params }: Params) {
  const { slug: raw, path = [] } = await params;
  // A preview's host rewrites to {slug}~{preview} (src/proxy.ts).
  const [slug, preview = null] = decodeURIComponent(raw).split("~");
  return { slug, preview, path, rest: `/${path.join("/")}${new URL(req.url).pathname.endsWith("/") && path.length ? "/" : ""}` };
}

/** Whether the visitor came over HTTPS, here or at the proxy in front: the door's cookie is then `__Host-` and Secure. */
const secure = (req: Request) => new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";

const cookieOf = (req: Request, name: string) =>
  req.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? null;

/** The door's cookie, on the site's own host only, for `seconds`. */
const doorCookie = (req: Request, value: string, seconds: number) =>
  `${unlockCookie(secure(req))}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure(req) ? "; Secure" : ""}`;

export async function GET(req: Request, ctx: Params) {
  const { slug, preview, path, rest } = await asked(req, ctx);
  if (rest === ENTER_PATH) return enter(req, slug, preview);
  // An approved request's link: its key, traded for the door's cookie, and the same page without it.
  const key = new URL(req.url).searchParams.get("key");
  if (key) {
    const value = await keyDoor(slug, key).catch(() => null);
    if (value) {
      const q = new URL(req.url).searchParams;
      q.delete("key");
      const headers = new Headers({ Location: `${rest}${q.size ? `?${q}` : ""}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
      headers.set("Set-Cookie", doorCookie(req, value, UNLOCK_DAYS * 86400));
      return new Response(null, { status: 303, headers });
    }
  }
  try {
    const f = await siteFile(slug, passOf(req), rest, cookieOf(req, unlockCookie(secure(req))), preview);
    if (!f) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    // Relative to the address asked: /guide to guide/.
    if ("slash" in f) return new Response(null, { status: 308, headers: { Location: `${path.at(-1) ?? ""}/${new URL(req.url).search}` } });
    if ("redirect" in f) {
      // The query goes along unless the target has its own, as Netlify does.
      const search = new URL(req.url).search;
      const headers = own(f.headers, false, preview);
      headers.set("Location", f.redirect.includes("?") ? f.redirect : `${f.redirect}${search}`);
      return new Response(null, { status: f.status, headers });
    }
    const { body, length } = await getStream(f.key);
    // Framed at BUILD_DOMAIN rather than its own domain (src/proxy.ts): never cached, so a visit there still goes on.
    const headers = own(f.headers, f.open && req.headers.get(FRAMED_HEADER) !== "1", preview);
    headers.set("Content-Type", f.contentType);
    headers.set("Content-Length", String(length));
    return new Response(body, { status: f.status, headers });
  } catch (err) {
    if (err instanceof AssetError && err.code === "password") return door(err, slug, `${rest}${new URL(req.url).search}`, false, preview);
    return handle(err);
  }
}

/**
 * A members site's ticket from the app (lib/core/sites.ts enterSite), traded
 * for the door's cookie, then on to the page asked. A ticket that doesn't
 * open it goes back to the app, which says why or hands a new one.
 */
async function enter(req: Request, slug: string, preview: string | null) {
  const q = new URL(req.url).searchParams;
  const to = localPath(q.get("to")) ? q.get("to")! : "/";
  const value = await letIn(slug, q.get("t") ?? "").catch(() => null);
  const headers = new Headers({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  if (!value) {
    headers.set("Location", await membersDoor(slug, to, preview));
    return new Response(null, { status: 303, headers });
  }
  headers.set("Location", to);
  headers.set("Set-Cookie", doorCookie(req, value, MEMBER_HOURS * 3600));
  return new Response(null, { status: 303, headers });
}

/** The door's form, posted to the address it stands at: the password checked as the portal checks it, then a cookie for the site's host. */
export async function POST(req: Request, ctx: Params) {
  const { slug, rest } = await asked(req, ctx);
  const form = await req.formData().catch(() => null);
  const password = String(form?.get("password") ?? "");
  try {
    await enterPortal(slug, { password, key: null, headers: req.headers });
  } catch (err) {
    if (err instanceof AssetError && (err.code === "password" || err.code === "rate_limited")) return door(err, slug, rest, true);
    return handle(err);
  }
  const value = await unlockValue(slug);
  return new Response(null, {
    status: 303,
    headers: { Location: `${rest}${new URL(req.url).search}`, "Set-Cookie": doorCookie(req, value ?? "", UNLOCK_DAYS * 86400) },
  });
}

/** The headers a build's answer carries (lib/site-serve.ts, as an edge in front sends them): the app may frame it. */
const own = (rules: [string, string][], open: boolean, preview: string | null) => siteHeaders(rules, open, preview, new URL(env.APP_URL).origin);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A members site's visitor goes to sign in at the app, and comes back let in (enter); a password site's ask here. */
async function door(err: AssetError, slug: string, rest: string, tried = false, preview: string | null = null) {
  const d = (err.detail ?? {}) as { name?: string; access?: string };
  if (d.access === "members") return new Response(null, { status: 303, headers: { Location: await membersDoor(slug, rest, preview), "Cache-Control": "no-store" } });
  const name = esc(d.name ?? "This site");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${name}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,sans-serif;background:#fafafa;color:#18181b}form{display:grid;gap:12px;width:min(320px,90vw)}h1{font-size:18px;margin:0}p{margin:0;color:#71717a}input,button{font:inherit;padding:9px 12px;border-radius:8px;border:1px solid #d4d4d8}button{background:#18181b;color:#fff;border-color:#18181b;cursor:pointer}@media (prefers-color-scheme:dark){body{background:#09090b;color:#fafafa}p{color:#a1a1aa}input{background:#18181b;color:#fafafa;border-color:#3f3f46}button{background:#fafafa;color:#18181b;border-color:#fafafa}}</style>
<form method="post" action="${esc(rest)}"><h1>${name}</h1><p>${tried ? esc(err.message) : "This site needs a password."}</p><input type="password" name="password" aria-label="Password" autocomplete="current-password" required autofocus><button>Enter</button></form></html>`;
  return new Response(html, { status: 401, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'" } });
}
