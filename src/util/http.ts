// Outbound HTTP with guard rails. EVERYTHING that fetches a URL we did not choose ourselves
// (candidate pages, candidate images, crawler targets) goes through `safeFetch`.
// It defends against SSRF (a hostile page pointing us at http://169.254.169.254/ or localhost),
// oversized downloads, and redirect tricks.
// KNOWN GAP: DNS-rebinding between our lookup and the actual connect. For production, pin the
// resolved IP with an undici dispatcher or run the fetcher in a network-isolated sandbox.
import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from '../config';

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||               // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||     // carrier-grade NAT
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224                                  // multicast / reserved
  );
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return ipv4Private(ip);
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::') return true;
  if (v6.startsWith('::ffff:')) {
    const dotted = v6.slice(7);
    return net.isIPv4(dotted) ? ipv4Private(dotted) : true; // hex-mapped form: be conservative
  }
  return /^(fc|fd|fe[89ab])/.test(v6); // unique-local + link-local
}

/** Throws unless `url` is http(s), on a default port, and resolves ONLY to public addresses. */
let warnedPrivate = false;
export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  // TEST ONLY: lets the offline demo fetch from a local server. Never set this in production.
  if (process.env.ALLOW_PRIVATE_HOSTS === '1') {
    if (!warnedPrivate) { warnedPrivate = true; console.warn('WARN SSRF protection is DISABLED (ALLOW_PRIVATE_HOSTS=1): test mode only.'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`blocked protocol ${url.protocol}`);
    return url;
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`blocked protocol ${url.protocol}`);
  if (url.port && !['80', '443'].includes(url.port)) throw new Error(`blocked port ${url.port}`);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('blocked private address');
  } else {
    const addrs = await dns.lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error('blocked: resolves to private address');
  }
  return url;
}

async function readLimited(res: Response, max: number): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > max) throw new Error(`response too large (${declared} > ${max})`);
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { await reader.cancel(); throw new Error(`response exceeded ${max} bytes`); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export interface SafeFetchOptions {
  maxBytes: number;
  timeoutMs?: number;
  allowedTypes?: RegExp;          // e.g. /^image\//
  headers?: Record<string, string>;
  maxRedirects?: number;
}
export interface SafeFetchResult { buffer: Buffer; contentType: string; finalUrl: string; status: number }

export async function safeFetch(rawUrl: string, opt: SafeFetchOptions): Promise<SafeFetchResult> {
  let current = rawUrl;
  for (let hop = 0; hop <= (opt.maxRedirects ?? 4); hop++) {
    const url = await assertPublicUrl(current); // re-validate on EVERY redirect hop
    const res = await fetch(url, {
      redirect: 'manual', // we follow redirects ourselves so each hop is validated
      signal: AbortSignal.timeout(opt.timeoutMs ?? config.limits.fetchTimeoutMs),
      headers: { 'user-agent': config.userAgent, accept: '*/*', ...opt.headers },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, url).toString();
      continue;
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (opt.allowedTypes && !opt.allowedTypes.test(contentType)) throw new Error(`unexpected content-type "${contentType}"`);
    return { buffer: await readLimited(res, opt.maxBytes), contentType, finalUrl: url.toString(), status: res.status };
  }
  throw new Error('too many redirects');
}

/** JSON call to a TRUSTED provider API (SerpApi, TinEye). Never leaks the URL (it contains keys) in errors. */
export async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = config.limits.connectorTimeoutMs): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}: ${body}`);
  }
  return res.json();
}
