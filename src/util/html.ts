// HTML parsing helpers (cheerio). Used by (a) page expansion in the verifier and (b) the crawler.
import * as cheerio from 'cheerio';

const SKIP = /(sprite|favicon|spacer|pixel|blank|1x1|tracking|badge|emoji)/i;

function abs(u: string | undefined, base: string): string | null {
  if (!u) return null;
  try {
    const url = new URL(u.trim(), base);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

/** Candidate image URLs on a page, best first: social-preview images, then <img> (largest srcset entry). */
export function extractImages(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const out: string[] = [];
  const add = (u: string | null) => {
    if (u && !/\.(svg)(\?|$)/i.test(u) && !SKIP.test(u) && !out.includes(u)) out.push(u);
  };
  // 1) The page's own declared "main image" is the most likely thing to be the content.
  add(abs($('meta[property="og:image"]').attr('content'), baseUrl));
  add(abs($('meta[name="twitter:image"]').attr('content'), baseUrl));
  add(abs($('link[rel="image_src"]').attr('href'), baseUrl));
  // 2) Regular images.
  $('img').each((_, el) => {
    const w = Number($(el).attr('width') ?? 0), h = Number($(el).attr('height') ?? 0);
    if ((w && w < 64) || (h && h < 64)) return; // obvious icons
    const srcset = $(el).attr('srcset');
    const fromSet = srcset ? srcset.split(',').map((s) => s.trim().split(/\s+/)[0]).pop() : undefined;
    add(abs(fromSet ?? $(el).attr('data-src') ?? $(el).attr('src'), baseUrl));
  });
  return out;
}

/** Same-origin links on a page (used by the crawler to go one level deep). */
export function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const origin = new URL(baseUrl).origin;
  const out = new Set<string>();
  $('a[href]').each((_, el) => {
    const u = abs($(el).attr('href'), baseUrl);
    if (!u) return;
    const url = new URL(u);
    url.hash = '';
    if (url.origin === origin && !/\.(pdf|zip|mp4|mp3|exe|dmg)$/i.test(url.pathname)) out.add(url.toString());
  });
  return [...out];
}
