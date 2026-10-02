// Outbound HTTP for links found INSIDE feeds (article pages, pictures). Those
// URLs come from third parties, so two things are enforced here rather than
// trusted: (1) no request may reach the machine itself or its private network
// (loopback, private, link-local, CGNAT, multicast...), checked again on every
// redirect hop (blind SSRF: a feed must not make the server GET its own
// /api/next); (2) bodies are read as a stream and cut at a byte cap, so a
// chunked response without Content-Length cannot fill the memory of a 24/7
// process. The operator's own feed list may point at a private host (a local
// feed server); only that caller passes `allowPrivate`.
import dns from 'node:dns';
import net from 'node:net';

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function v4Private(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 || // this network, private, loopback, multicast/reserved
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local (cloud metadata lives here)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && p[2] === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** Is this IP address (v4 or v6) one the server must never fetch from a feed link? */
export function isPrivateAddress(ip) {
  const s = String(ip || '').trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIPv4(s)) return v4Private(s);
  if (!net.isIPv6(s)) return true;
  const mapped = s.match(/^(?:0{0,4}:){0,5}(?:0{0,4}:)?ffff:(\d+\.\d+\.\d+\.\d+)$/) || s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Private(mapped[1]);
  const hex = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
    return v4Private([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
  }
  if (s === '::' || s === '::1') return true;
  const first = parseInt(s.split(':')[0] || '0', 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00; // ULA, link-local, multicast
}

const LOCAL_NAMES = /(?:^|\.)(?:localhost|local|internal|intranet|lan|home\.arpa|localdomain)$/i;

/**
 * Throws unless `url` is http(s) to a public host. A literal address is checked
 * directly; a name is resolved (when it resolves here: behind an egress proxy
 * it may not, and then the proxy decides) and refused if any address is private.
 */
export async function assertPublicUrl(url, { lookup = defaultLookup } = {}) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error('invalid URL');
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error('not an http(s) URL');
  if (u.username || u.password) throw new Error('URL with credentials refused');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host) throw new Error('invalid URL');
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('private address refused');
    return u;
  }
  if (LOCAL_NAMES.test(host) || !host.includes('.')) throw new Error('local host name refused');
  let addresses = [];
  try {
    addresses = await lookup(host);
  } catch {
    return u; // unresolvable here: the request itself will fail, or a proxy resolves it
  }
  if (addresses.some((a) => isPrivateAddress(a.address ?? a))) throw new Error('private address refused');
  return u;
}

function defaultLookup(host) {
  return Promise.race([
    dns.promises.lookup(host, { all: true, verbatim: true }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('dns timeout')), 2000).unref?.()),
  ]);
}

/**
 * fetch() for feed-supplied URLs: redirects are followed by hand (at most
 * `maxRedirects`), every hop through assertPublicUrl unless `allowPrivate`.
 * Returns the final Response (status not checked) and its URL.
 */
export async function guardedFetch(fetchImpl, url, { timeoutMs = 10000, headers = {}, allowPrivate = false, maxRedirects = 4, lookup } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = url;
  for (let hop = 0; ; hop++) {
    if (!allowPrivate) await assertPublicUrl(current, lookup ? { lookup } : undefined);
    else if (!/^https?:\/\//i.test(current)) throw new Error('not an http(s) URL');
    const res = await fetchImpl(current, { headers, signal, redirect: 'manual' });
    if (!REDIRECTS.has(res.status)) return { res, url: current };
    const location = res.headers?.get?.('location');
    try {
      await res.body?.cancel?.();
    } catch {}
    if (!location || hop >= maxRedirects) throw new Error(location ? 'too many redirects' : `HTTP ${res.status} without location`);
    current = new URL(location, current).href;
  }
}

/**
 * Read a response body as a stream, at most `maxBytes`. With `truncate` the
 * first `maxBytes` are returned (an HTML page: the head is what matters);
 * otherwise a bigger body is an error (a picture cut in half is no picture).
 * A declared Content-Length over the cap fails before anything is read.
 */
export async function readCapped(res, maxBytes, { truncate = false, tooLarge = 'response too large' } = {}) {
  const declared = Number(res.headers?.get?.('content-length') || 0);
  if (!truncate && declared > maxBytes) {
    try {
      await res.body?.cancel?.();
    } catch {}
    throw new Error(tooLarge);
  }
  if (!res.body?.getReader) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes && !truncate) throw new Error(tooLarge);
    return buf.subarray(0, maxBytes);
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        if (!truncate) throw new Error(tooLarge);
        chunks.push(Buffer.from(value.subarray(0, value.length - (total - maxBytes))));
        total = maxBytes;
        break;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    try {
      await reader.cancel();
    } catch {}
  }
  return Buffer.concat(chunks, total);
}
