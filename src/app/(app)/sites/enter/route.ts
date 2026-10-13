import { handle } from "@/lib/api";
import { enterSite } from "@/lib/core/sites";

/**
 * A members site's way in (lib/core/sites.ts enterSite): its builds answer on
 * the site's own host, where the app's session doesn't reach, so its door
 * sends visitors here. Someone signed in who may read its project goes back
 * with a ticket; anyone else signs in first, then comes back here.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const out = await enterSite(url.searchParams.get("site") ?? "", req.headers, url.searchParams.get("to"));
    const headers = new Headers({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    if ("url" in out) headers.set("Location", out.url);
    else if ("signIn" in out) headers.set("Location", `/login?${new URLSearchParams({ next: `${url.pathname}${url.search}` })}`);
    else return refused(out.refused);
    return new Response(null, { status: 303, headers });
  } catch (err) {
    return handle(err);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function refused(why: string) {
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Members only</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,sans-serif;background:#fafafa;color:#18181b}main{display:grid;gap:12px;width:min(360px,90vw)}h1{font-size:18px;margin:0}p{margin:0;color:#71717a}a{color:inherit}@media (prefers-color-scheme:dark){body{background:#09090b;color:#fafafa}p{color:#a1a1aa}}</style>
<main><h1>Members only</h1><p>${esc(why)}</p><p><a href="/">Back to the app</a></p></main></html>`;
  return new Response(html, { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
