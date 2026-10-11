// Sandboxed fetching of candidate content. "Sandboxed" here means: SSRF-checked, size-capped,
// content-type-checked, and NEVER rendered (no JS executed, no subresources loaded).
import { config } from '../config';
import { safeFetch } from '../util/http';
import { extractImages } from '../util/html';

export async function fetchImageBytes(url: string): Promise<Buffer> {
  const r = await safeFetch(url, {
    maxBytes: config.limits.candidateImageBytes,
    allowedTypes: /^image\//i,
    headers: { accept: 'image/*' },
  });
  return r.buffer;
}

/** "Page expansion": open an HTML page and list the image URLs on it (best first). */
export async function expandPage(pageUrl: string, max: number): Promise<string[]> {
  const r = await safeFetch(pageUrl, {
    maxBytes: config.limits.htmlBytes,
    allowedTypes: /text\/html|application\/xhtml/i,
    headers: { accept: 'text/html' },
  });
  return extractImages(r.buffer.toString('utf8'), r.finalUrl).slice(0, max);
}
