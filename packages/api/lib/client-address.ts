/**
 * Which address a request really came from, behind a reverse proxy.
 *
 * The socket address alone is useless here: behind Traefik every request arrives
 * from Traefik, so anything counted per address would count all visitors as one.
 * `X-Forwarded-For` carries the real one - but it is a header, and a header is
 * whatever the sender says it is, so which part of it may be believed depends
 * entirely on how many proxies are known to sit in front.
 *
 * A proxy *appends* the address it received the request from. With one proxy in
 * front, an attacker sending `X-Forwarded-For: 1.2.3.4` produces
 * `1.2.3.4, <their real address>` - the invented entry is on the left, the
 * observed one on the right. Counting hops from the right is therefore the only
 * way to read the header safely, and how far to count is a property of the
 * deployment, not of the request.
 *
 * `trustedProxies` says how many hops sit in front:
 *
 *   0  believe nothing - use the socket address. Right for a server reachable
 *      directly, wrong behind Traefik, where it lumps everyone together.
 *   1  the shipped setup: Traefik and nothing else.
 *   2  a CDN in front of Traefik, and so on.
 *
 * Only safe while the container cannot be reached around the proxy;
 * `compose.prod.yml` keeps it on an internal network for that reason.
 */

/** More entries than this is not a proxy chain, it is someone being clever. */
const MAX_HOPS = 20;

/** `1.2.3.4:5678` and `[::1]:8080` are the same address as without the port. */
const withoutPort = (value: string) => {
  const bracketed = /^\[(.+)\]:\d+$/.exec(value);
  if (bracketed) return bracketed[1]!;
  const ipv4 = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  return ipv4 ? ipv4[1]! : value;
};

/** The bucket used when there is nothing to go on. Shared, and that is fine. */
export const UNKNOWN_ADDRESS = "unknown";

export const clientAddress = (
  forwardedFor: string | null | undefined,
  socketAddress: string | null | undefined,
  trustedProxies: number,
): string => {
  const socket = socketAddress?.trim()
    ? withoutPort(socketAddress.trim()).toLowerCase()
    : null;

  if (trustedProxies <= 0 || !forwardedFor) return socket ?? UNKNOWN_ADDRESS;

  const hops = forwardedFor
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(-MAX_HOPS);

  // Counted from the right, because that end is the one the nearest proxy wrote.
  const index = hops.length - trustedProxies;
  // Fewer hops than expected means the request did not come the way it was
  // supposed to, so the header says nothing worth believing.
  if (index < 0 || index >= hops.length) return socket ?? UNKNOWN_ADDRESS;

  return withoutPort(hops[index]!).toLowerCase();
};
