/**
 * A build's own redirects and headers (PRD part 2, SITE-23), in the format
 * Netlify and Cloudflare Pages read, so a site moving here keeps them: a
 * `_redirects` file and a `_headers` file at the root of the build, read as it
 * deploys (lib/core/sites.ts) and applied as it is served.
 *
 *   # _redirects: from, to, status (301 when left out); ! applies it even over a file
 *   /signup        https://app.example.com/signup   302
 *   /blog/*        /news/:splat                     301
 *   /app/*         /app/index.html                  200
 *
 *   # _headers: a path, then its headers, indented
 *   /*
 *     Content-Security-Policy: default-src 'self'
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export const REDIRECTS = "_redirects";
export const HEADERS = "_headers";

const STATUSES = [200, 301, 302, 303, 307, 308, 404] as const;
export type Redirect = { from: string; to: string; status: (typeof STATUSES)[number]; force: boolean };
export type HeaderRule = { path: string; headers: [string, string][] };
export type SiteRules = { redirects: Redirect[]; headers: HeaderRule[] };

export const MAX_REDIRECTS = 1000;
export const MAX_HEADER_RULES = 200;

/**
 * Headers a build may not set: the server's to frame the answer (length,
 * encoding, connection), a redirect's own, and cookies, which on a domain
 * shared with other sites are no build's to set.
 */
const DENIED = new Set([
  "set-cookie",
  "set-cookie2",
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "trailer",
  "location",
  "host",
  "proxy-authenticate",
  "www-authenticate",
]);

const PATTERN = /^\/[^\s]*$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

/** A path pattern: segments, `:name` for one, and `*` at the end for the rest. Null when it isn't one. */
function patternError(p: string) {
  if (!PATTERN.test(p)) return "a path starting with /";
  const star = p.indexOf("*");
  if (star >= 0 && star !== p.length - 1) return "* only at the end";
  return null;
}

/** `_redirects`, line by line: the rules, and what is wrong at which line. */
export function parseRedirects(text: string): { redirects: Redirect[]; errors: string[] } {
  const redirects: Redirect[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/(^|\s)#.*$/, "").trim();
    if (!line) return;
    const at = `${REDIRECTS}:${i + 1}`;
    const [from, to, code, ...more] = line.split(/\s+/);
    if (!to) return void errors.push(`${at}: a rule is a path, where it goes, and a status`);
    if (more.length || (code && !/^\d{3}!?$/.test(code))) return void errors.push(`${at}: conditions (query, country, language, role) aren't supported`);
    const bad = patternError(from);
    if (bad) return void errors.push(`${at}: ${from} isn't ${bad}`);
    const external = /^https?:\/\//i.test(to);
    if (!external && !to.startsWith("/")) return void errors.push(`${at}: ${to} isn't a path or an http(s) URL`);
    const status = code ? Number(code.replace("!", "")) : 301;
    if (!STATUSES.includes(status as Redirect["status"])) return void errors.push(`${at}: status ${status} isn't one of ${STATUSES.join(", ")}`);
    if (external && (status === 200 || status === 404)) return void errors.push(`${at}: a ${status} serves a file of the build, so its target is a path`);
    redirects.push({ from, to, status: status as Redirect["status"], force: !!code?.endsWith("!") });
  });
  if (redirects.length > MAX_REDIRECTS) errors.push(`${REDIRECTS}: ${MAX_REDIRECTS} rules at most`);
  return { redirects, errors };
}

/** `_headers`: a path at the start of a line, then its headers, indented. The rules, and what is wrong at which line. */
export function parseHeaders(text: string): { headers: HeaderRule[]; errors: string[] } {
  const headers: HeaderRule[] = [];
  const errors: string[] = [];
  let current: HeaderRule | null = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim() || raw.trim().startsWith("#")) return;
    const at = `${HEADERS}:${i + 1}`;
    if (!/^\s/.test(raw)) {
      const path = raw.trim();
      const bad = patternError(path);
      if (bad) {
        current = null;
        return void errors.push(`${at}: ${path} isn't ${bad}`);
      }
      current = { path, headers: [] };
      headers.push(current);
      return;
    }
    if (!current) return void errors.push(`${at}: a header comes after the path it is for`);
    const m = raw.trim().match(/^([^:]+):\s*(.*)$/);
    if (!m || !NAME.test(m[1].trim())) return void errors.push(`${at}: a header is Name: value`);
    const name = m[1].trim();
    if (DENIED.has(name.toLowerCase())) return void errors.push(`${at}: ${name} is the server's to set`);
    (current as HeaderRule).headers.push([name, m[2].trim()]);
  });
  if (headers.length > MAX_HEADER_RULES) errors.push(`${HEADERS}: ${MAX_HEADER_RULES} paths at most`);
  return { headers, errors };
}

/** What a pattern captures from a path: `:name`s and `splat`; null when it doesn't match. A trailing slash is the same path. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const strip = (s: string) => (s.length > 1 ? s.replace(/\/+$/, "") : s);
  const p = strip(pattern).split("/");
  const s = strip(path).split("/");
  const out: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i] === "*") {
      out.splat = s.slice(i).join("/");
      return out;
    }
    if (i >= s.length) return null;
    if (p[i].startsWith(":") && p[i].length > 1) {
      if (!s[i]) return null;
      out[p[i].slice(1)] = s[i];
    } else if (p[i] !== s[i]) return null;
  }
  return p.length === s.length ? out : null;
}

/** The first redirect for a path, its target filled in from what the pattern captured. */
export function redirectFor(redirects: Redirect[], path: string) {
  for (const r of redirects) {
    const got = matchPath(r.from, path);
    if (!got) continue;
    const to = r.to.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (whole, name: string) => (name in got ? got[name] : whole));
    return { ...r, to };
  }
  return null;
}

/** Every header the rules give a path, in the order the file lists them. */
export const headersFor = (rules: HeaderRule[], path: string): [string, string][] => rules.filter((r) => matchPath(r.path, path)).flatMap((r) => r.headers);
