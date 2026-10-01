import { lookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import pkg from "../../package.json" with { type: "json" };
import { PROJECT_URL } from "./branding.ts";

/**
 * Fetch a URL an API caller handed us, without letting them point the server
 * at itself or its network (SSRF): loopback, private ranges, link-local cloud
 * metadata endpoints, and the rest of the special-purpose space.
 *
 * The check runs inside the socket's DNS lookup, so the address that was
 * checked is the address that is connected to: no window for a rebinding DNS
 * answer to swap in 127.0.0.1 between check and connect. Every redirect hop
 * goes through the same guard.
 */

const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  // Unspecified, loopback and the deprecated IPv4-compatible ::a.b.c.d.
  ["::", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(net, bits, "ipv6");

export function isPublicAddress(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:127.0.0.1) is judged as the IPv4 it carries.
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mapped) return isPublicAddress(mapped);
  const family = isIP(ip);
  if (!family) return false;
  return !blocked.check(ip, family === 4 ? "ipv4" : "ipv6");
}

export class FetchError extends Error {}

/**
 * Names the tool, its version and where to read about it, as sites ask of bots
 * (Wikimedia answers 429 to a bare one). Not a browser's, so Google Fonts still
 * serves whole TTFs (lib/font.ts).
 */
export const USER_AGENT = `Artbucket/${pkg.version} (+${PROJECT_URL})`;

type Lookup = NonNullable<http.RequestOptions["lookup"]>;

const guardedLookup: Lookup = (hostname, options, callback) => {
  lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err, address, family);
    const all: LookupAddress[] = Array.isArray(address) ? address : [{ address, family: family! }];
    const bad = all.find((a) => !isPublicAddress(a.address));
    if (bad) return callback(new FetchError(`${hostname} resolves to a non-public address`), address, family);
    callback(null, address, family);
  });
};

/**
 * `timeoutMs` is how long the connection may sit idle; `signal` ends the
 * whole fetch, however slowly it trickles (AbortSignal.timeout), ten minutes
 * when not given, so a server dripping a byte at a time can't hold one forever. `accept`
 * says which statuses answer rather than throw: 200 unless said. `follow`
 * says which redirects it may take, from the URL asked to the next.
 */
export async function fetchPublic(
  raw: string,
  {
    maxBytes,
    timeoutMs = 30_000,
    redirects = 5,
    signal = AbortSignal.timeout(10 * 60_000),
    accept = (status: number) => status === 200,
    follow,
  }: { maxBytes: number; timeoutMs?: number; redirects?: number; signal?: AbortSignal; accept?: (status: number) => boolean; follow?: (to: URL, from: URL) => boolean },
): Promise<{ bytes: Buffer; mime: string; url: URL; status: number }> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchError("Only http and https URLs");
  // An IP literal never reaches the lookup, so it is checked here.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) throw new FetchError(`${host} is not a public address`);

  const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).get(
      url,
      { lookup: guardedLookup, timeout: timeoutMs, headers: { "user-agent": USER_AGENT }, signal },
      resolve,
    );
    req.on("timeout", () => req.destroy(new FetchError("Timed out")));
    req.on("error", reject);
  });

  const status = res.statusCode ?? 0;
  if (status >= 300 && status < 400 && res.headers.location) {
    res.resume();
    if (redirects <= 0) throw new FetchError("Too many redirects");
    const next = new URL(res.headers.location, url);
    if (follow && !follow(next, url)) throw new FetchError(`It redirects to ${next.origin}, which isn't followed`);
    return fetchPublic(next.toString(), { maxBytes, timeoutMs, redirects: redirects - 1, signal, accept, follow });
  }
  if (!accept(status)) {
    res.resume();
    throw new FetchError(`Fetching it returned ${status}`);
  }
  if (Number(res.headers["content-length"] ?? 0) > maxBytes) {
    res.destroy();
    throw new FetchError(`Larger than ${maxBytes} bytes`);
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of res) {
    size += chunk.length;
    if (size > maxBytes) {
      res.destroy();
      throw new FetchError(`Larger than ${maxBytes} bytes`);
    }
    chunks.push(chunk);
  }
  const mime = (res.headers["content-type"] ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
  return { bytes: Buffer.concat(chunks), mime, url, status };
}
