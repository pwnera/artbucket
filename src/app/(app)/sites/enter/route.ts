import { handle } from "@/lib/api";
import { ipOf } from "@/lib/client-ip";
import { AssetError } from "@/lib/core/errors";
import { requestAccess } from "@/lib/core/portals";
import { enterSite } from "@/lib/core/sites";

/**
 * A members site's way in (lib/core/sites.ts enterSite): its builds answer on
 * the site's own host, where the app's session doesn't reach, so its door
 * sends visitors here. Someone signed in who may read its project goes back
 * with a ticket. Someone signed out is offered to sign in, or to ask for
 * access; someone signed in who isn't a member, to ask. The ask (POST) is the
 * one a portal takes: its admins hear about it, and an approval mails a link
 * that opens the site (lib/core/sites.ts keyDoor).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const site = url.searchParams.get("site") ?? "";
  try {
    const out = await enterSite(site, req.headers, url.searchParams.get("to"), url.searchParams.get("preview"));
    if ("url" in out) return new Response(null, { status: 303, headers: { Location: out.url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    if ("signIn" in out) {
      const signIn = `/login?${new URLSearchParams({ next: `${url.pathname}${url.search}` })}`;
      return page(200, out.name, `<p>${esc(out.name)} is for the people of its project.</p><p><a class="button" href="${esc(signIn)}">Sign in</a></p>${ask(site, "Not one of them? Ask for access")}`);
    }
    return page(403, out.name ?? "Members only", `<p>${esc(out.refused)}</p>${out.name ? ask(site, "Ask its team for access", out.email) : ""}`);
  } catch (err) {
    return handle(err);
  }
}

/** An ask for access, from the form below. It answers the same whoever asks, as the portal's does. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const field = (k: string) => String(form?.get(k) ?? "").trim();
  const site = field("site");
  try {
    await requestAccess(site, { email: field("email"), name: field("name") || undefined, note: field("note") || undefined }, ipOf(req.headers));
    return page(202, "Asked", "<p>The site's team hears about it. When they say yes, a link to it comes by email.</p>");
  } catch (err) {
    if (err instanceof AssetError && ["invalid", "rate_limited"].includes(err.code)) return page(400, "Ask for access", `<p>${esc(err.message)}</p>${ask(site, "Try again", field("email"))}`);
    return handle(err);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const ask = (site: string, title: string, email = "") => `<form method="post" action="/sites/enter"><h2>${esc(title)}</h2>
<input type="hidden" name="site" value="${esc(site)}">
<input type="email" name="email" required maxlength="320" placeholder="Your email" aria-label="Your email" autocomplete="email" value="${esc(email)}">
<input name="name" maxlength="120" placeholder="Your name (optional)" aria-label="Your name" autocomplete="name">
<textarea name="note" maxlength="1000" rows="3" placeholder="Why you'd like in (optional)" aria-label="Why you'd like in"></textarea>
<button>Ask for access</button></form>`;

function page(status: number, title: string, body: string) {
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,sans-serif;background:#fafafa;color:#18181b}main{display:grid;gap:12px;width:min(380px,90vw);padding:24px 0}h1{font-size:18px;margin:0}h2{font-size:15px;margin:12px 0 0}p{margin:0;color:#71717a}form{display:grid;gap:8px}input,textarea,button{font:inherit;padding:9px 12px;border-radius:8px;border:1px solid #d4d4d8;background:#fff;color:inherit}button,.button{background:#18181b;color:#fff;border:1px solid #18181b;cursor:pointer}.button{display:inline-block;padding:9px 16px;border-radius:8px;text-decoration:none}@media (prefers-color-scheme:dark){body{background:#09090b;color:#fafafa}p{color:#a1a1aa}input,textarea{background:#18181b;border-color:#3f3f46}button,.button{background:#fafafa;color:#18181b;border-color:#fafafa}}</style>
<main><h1>${esc(title)}</h1>${body}</main></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
