import { lookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";

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
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
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

export async function fetchPublic(
  raw: string,
  { maxBytes, timeoutMs = 30_000, redirects = 5 }: { maxBytes: number; timeoutMs?: number; redirects?: number },
): Promise<{ bytes: Buffer; mime: string; url: URL }> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchError("Only http and https URLs");
  // An IP literal never reaches the lookup, so it is checked here.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) throw new FetchError(`${host} is not a public address`);

  const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).get(
      url,
      { lookup: guardedLookup, timeout: timeoutMs, headers: { "user-agent": "artbucket" } },
      resolve,
    );
    req.on("timeout", () => req.destroy(new FetchError("Timed out")));
    req.on("error", reject);
  });

  const status = res.statusCode ?? 0;
  if (status >= 300 && status < 400 && res.headers.location) {
    res.resume();
    if (redirects <= 0) throw new FetchError("Too many redirects");
    return fetchPublic(new URL(res.headers.location, url).toString(), { maxBytes, timeoutMs, redirects: redirects - 1 });
  }
  if (status !== 200) {
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
  return { bytes: Buffer.concat(chunks), mime, url };
}
