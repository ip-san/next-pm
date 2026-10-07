/**
 * Port of Redmine's `WebhookEndpointValidator`, hardened. A webhook URL is attacker-chosen
 * input that the server then fetches, so the two things that matter are: the scheme/port must
 * be ordinary HTTP, and the address it resolves to must not be one the server can reach but
 * the outside world cannot.
 *
 * Redmine blocks loopback, link-local, multicast and 0.0.0.0/:: but *not* RFC 1918 — it
 * assumes an admin-curated `webhook_blocklist`. next-pm has no such configuration file, so
 * private ranges are blocked outright here (10/8, 172.16/12, 192.168/10, 100.64/10, CGNAT,
 * unique-local IPv6, and IPv4-mapped IPv6 forms of all of them).
 *
 * The address check is deliberately separate from the URL check and is applied again at
 * connect time against the address actually dialled (infrastructure/http/webhook-sender.ts) —
 * validating a hostname once and then handing it to a client that resolves it again leaves a
 * DNS-rebinding window open.
 */

/**
 * Ports that browsers refuse for HTTP, per the WHATWG Fetch "bad ports" list — same list
 * Redmine carries, same reason: an HTTP request smuggled at one of these speaks to a protocol
 * that will misread it.
 */
export const BAD_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110,
  111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061,
  6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

export type EndpointRejection =
  | "invalid_url"
  | "unsupported_scheme"
  | "blocked_port"
  | "missing_host"
  | "blocked_address";

export interface ParsedEndpoint {
  hostname: string;
  port: number;
  secure: boolean;
}

function defaultPort(protocol: string): number {
  return protocol === "https:" ? 443 : 80;
}

/**
 * Checks everything about a URL that can be decided without touching the network. The
 * resolved address still has to pass `isBlockedAddress` before anything is sent.
 */
export function parseWebhookEndpoint(raw: string): { ok: true; endpoint: ParsedEndpoint } | { ok: false; reason: EndpointRejection } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "unsupported_scheme" };
  }
  if (!url.hostname) {
    return { ok: false, reason: "missing_host" };
  }
  const port = url.port ? Number(url.port) : defaultPort(url.protocol);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || BAD_PORTS.has(port)) {
    return { ok: false, reason: "blocked_port" };
  }
  return { ok: true, endpoint: { hostname: url.hostname, port, secure: url.protocol === "https:" } };
}

function ipv4Blocked(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // "this network", including 0.0.0.0
  if (a === 10) return true; // RFC 1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. the cloud metadata address
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 192 && b === 0) return true; // IETF protocol assignments (192.0.0/24, 192.0.2/24)
  if (a === 100 && b >= 64 && b <= 127) return true; // RFC 6598 CGNAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) ? octets : null;
}

/** Expands an IPv6 literal to its eight 16-bit groups, or null if it isn't one. */
function parseIpv6(address: string): number[] | null {
  const zoneless = address.split("%")[0];
  const halves = zoneless.split("::");
  if (halves.length > 2) return null;

  const toGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const groups: number[] = [];
    for (const piece of part.split(":")) {
      const embeddedV4 = parseIpv4(piece);
      if (embeddedV4) {
        groups.push((embeddedV4[0] << 8) | embeddedV4[1], (embeddedV4[2] << 8) | embeddedV4[3]);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null;
      groups.push(parseInt(piece, 16));
    }
    return groups;
  };

  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  if (head === null || tail === null) return null;
  if (halves.length === 1) {
    return head.length === 8 ? head : null;
  }
  const fill = 8 - head.length - tail.length;
  return fill >= 0 ? [...head, ...Array<number>(fill).fill(0), ...tail] : null;
}

/**
 * True when an already-resolved IP address must not be connected to. Unparseable input is
 * treated as blocked: the caller is about to open a socket, so "I don't understand this
 * address" has to fail closed.
 */
export function isBlockedAddress(address: string): boolean {
  const v4 = parseIpv4(address);
  if (v4) {
    return ipv4Blocked(v4);
  }

  const v6 = parseIpv6(address);
  if (!v6) return true;

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) forms reach the same hosts.
  const isMapped = v6.slice(0, 5).every((group) => group === 0) && (v6[5] === 0xffff || v6[5] === 0);
  if (isMapped) {
    const mapped = [v6[6] >> 8, v6[6] & 0xff, v6[7] >> 8, v6[7] & 0xff];
    // ::1 is loopback, :: is unspecified; both land here as 0.0.0.x and are caught by ipv4Blocked.
    return ipv4Blocked(mapped);
  }

  if (v6.every((group) => group === 0)) return true; // ::
  if ((v6[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((v6[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((v6[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}
