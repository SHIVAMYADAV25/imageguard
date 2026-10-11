// Google Lens and Yandex (through SerpApi) accept an image URL, not an upload. So to search with
// a private image we must expose it at a temporary public URL.
//
// PRIVACY MODEL
//  * Served from YOUR machine through YOUR tunnel (PUBLIC_BASE_URL) - not a third-party image host.
//  * The URL contains 256 random bits, lives ~2 minutes and is revoked as soon as discovery ends.
//  * Only the normalized, EXIF-stripped copy is served.
//  * The search provider (SerpApi -> Google/Yandex) does still fetch it. Tell users this.
import http from 'node:http';
import crypto from 'node:crypto';
import { config } from '../config';
import { log } from '../util/log';

const files = new Map<string, { buf: Buffer; expires: number }>();
let server: http.Server | null = null;

function ensureServer(): Promise<void> {
  if (server) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const m = /^\/img\/([a-f0-9]{64})\.jpg$/.exec(req.url ?? '');
      const hit = m && files.get(m[1]);
      if (req.method !== 'GET' || !hit || hit.expires < Date.now()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
      res.end(hit.buf);
    });
    server.once('error', reject);
    // Bind to localhost only: the tunnel process connects locally, nothing else should.
    server.listen(config.hostPort, '127.0.0.1', () => {
      log.info('host', `temp image host on 127.0.0.1:${config.hostPort} -> ${config.publicBaseUrl}`);
      resolve();
    });
    server.unref();
  });
}

export interface TempImage { url: string; revoke: () => void }

/** Returns null when PUBLIC_BASE_URL is not configured (URL-based connectors are then skipped). */
export async function publishTemp(buf: Buffer, ttlMs = 120_000): Promise<TempImage | null> {
  if (!config.publicBaseUrl) return null;
  await ensureServer();
  const token = crypto.randomBytes(32).toString('hex');
  files.set(token, { buf, expires: Date.now() + ttlMs });
  setTimeout(() => files.delete(token), ttlMs).unref();
  return { url: `${config.publicBaseUrl}/img/${token}.jpg`, revoke: () => files.delete(token) };
}

export async function closeTempHost(): Promise<void> {
  files.clear();
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = null;
}
