import { BlockList, isIP } from "node:net";

/**
 * The client's address, behind the reverse proxies TRUSTED_PROXIES names.
 *
 * X-Forwarded-For is a list each proxy appends to, so only its right end is
 * written by someone the server trusts: the client is the last entry that
 * isn't one of its proxies. The left end is whatever the client sent.
 * Unset, the header is ignored (and X-Real-IP with it): a server reached
 * directly would take whatever the client wrote there, so every client
 * shares one count and none is recorded by address.
 *
 * Plain Node, no `@/` imports: src/proxy.ts and the tests load it too.
 */

/** `private`: the ranges no public address is in, where the proxies of Docker, Kubernetes, Fly or a VPS live. */
const PRIVATE = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "169.254.0.0/16", "100.64.0.0/10", "fc00::/7", "fe80::/10", "::1/128"];

/** TRUSTED_PROXIES as written: addresses and ranges, comma-separated, `private` standing for PRIVATE. Throws on anything else. */
export function trustedProxies(value: string | undefined): string[] | null {
  const entries = (value ?? "").split(",").map((s) => s.trim()).filter(Boolean).flatMap((e) => (e === "private" ? PRIVATE : [e]));
  for (const e of entries) if (!subnet(e)) throw new Error(`TRUSTED_PROXIES: "${e}" is not an address, a range (10.0.0.0/8) or "private"`);
  return entries.length ? entries : null;
}

function subnet(entry: string) {
  const [address, bits, extra] = entry.split("/");
  const family = isIP(address);
  const max = family === 6 ? 128 : 32;
  if (!family || extra !== undefined || (bits !== undefined && !/^\d{1,3}$/.test(bits)) || Number(bits ?? max) > max) return null;
  return { address, prefix: Number(bits ?? max), type: family === 6 ? ("ipv6" as const) : ("ipv4" as const) };
}

export function blockList(entries: string[] | null) {
  if (!entries) return null;
  const list = new BlockList();
  for (const e of entries) {
    const s = subnet(e)!;
    list.addSubnet(s.address, s.prefix, s.type);
  }
  return list;
}

/** An entry as proxies write it, bare: no brackets, no port, an IPv4 address mapped into IPv6 as itself. */
const bare = (entry: string) => {
  const e = entry.trim();
  const v = e.match(/^\[([^\]]+)\](?::\d+)?$/)?.[1] ?? e.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)?.[1] ?? e;
  const mapped = v.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1];
  return mapped ?? v.toLowerCase();
};

type HeaderBag = { get(name: string): string | null };

/** The client's address in these headers, with these proxies trusted; null when it can't be told. */
export function clientIp(headers: HeaderBag, trusted: BlockList | null): string | null {
  if (!trusted) return null;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded === null) return headers.get("x-real-ip")?.trim() || null;
  const hops = forwarded.split(",").map(bare).filter(Boolean);
  for (let i = hops.length - 1; i >= 0; i--) {
    const family = isIP(hops[i]);
    // Not an address where a proxy should have written one: nothing to its left can be believed either.
    if (!family) return null;
    if (!trusted.check(hops[i], family === 6 ? "ipv6" : "ipv4")) return hops[i];
  }
  // Every hop is a proxy's: the client is in a trusted range too, and the furthest hop is the closest to it.
  return hops[0] ?? null;
}

const TRUSTED = blockList(trustedProxies(process.env.TRUSTED_PROXIES));
let warned = false;

/** The client's address, as the proxies in TRUSTED_PROXIES report it. */
export function ipOf(headers: HeaderBag): string | null {
  if (!TRUSTED && !warned && headers.get("x-forwarded-for") !== null) {
    warned = true;
    console.warn("[artbucket] Requests come through a proxy (X-Forwarded-For) but TRUSTED_PROXIES is unset: the header is ignored, so every client shares one rate limit and none is recorded by address. See /configuration/security.");
  }
  return clientIp(headers, TRUSTED);
}
