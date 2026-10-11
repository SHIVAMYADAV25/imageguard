// The crawler: seeds -> pages -> images -> fingerprints -> vector store.
// DESIGN RULES (all enforced in code):
//  * robots.txt is obeyed for pages AND image hosts; Crawl-delay is honoured; >= minDelayMs between hits per domain.
//  * One request at a time per domain; several domains in parallel.
//  * We store {pageUrl, imageUrl, pHash, embedding}. We never store image bytes.
//  * Explicit images are DROPPED at ingestion (NudeNet gate). The own index is for permitted,
//    non-explicit public pages; adult / leak-site coverage comes from the reverse-image providers.
//  * The crawler refuses to start without the NSFW model, so the gate can never be silently off.
//  * Static HTML only (no JS rendering). For JS-heavy sites swap fetch for Playwright.
import { config } from '../config';
import { getStore } from '../index/vectorStore';
import { getEmbedder } from '../fingerprint/embed';
import { phash } from '../fingerprint/phash';
import { normalize, dims } from '../util/image';
import { safeFetch } from '../util/http';
import { extractImages, extractLinks } from '../util/html';
import { mapLimit, sleep } from '../util/math';
import { log } from '../util/log';
import { isAllowed, crawlDelayMs } from './robots';
import { classifyNsfw, nsfwModelAvailable } from '../verify/nsfw';

export interface CrawlOptions {
  maxPagesPerDomain: number;
  maxImagesPerPage: number;
  minDelayMs: number;
  domainConcurrency: number;
  followLinks: boolean; // also visit a few same-site links found on each seed page
}
export const defaultCrawlOptions: CrawlOptions = { maxPagesPerDomain: 3, maxImagesPerPage: 8, minDelayMs: 1500, domainConcurrency: 4, followLinks: false };

export interface CrawlStats { pages: number; blockedByRobots: number; imagesSeen: number; indexed: number; droppedExplicit: number; errors: number }

export async function crawlSeeds(seeds: string[], opt: CrawlOptions = defaultCrawlOptions): Promise<CrawlStats> {
  if (!nsfwModelAvailable()) throw new Error('Refusing to crawl without the NSFW model (models/nsfw_nudenet.onnx). Run: npm run models');
  const stats: CrawlStats = { pages: 0, blockedByRobots: 0, imagesSeen: 0, indexed: 0, droppedExplicit: 0, errors: 0 };

  // Group seeds by origin: politeness is enforced PER DOMAIN.
  const byOrigin = new Map<string, string[]>();
  for (const s of seeds) {
    try { const o = new URL(s).origin; byOrigin.set(o, [...(byOrigin.get(o) ?? []), s]); } catch { /* bad line */ }
  }
  await mapLimit([...byOrigin.entries()], opt.domainConcurrency, ([origin, urls]) => crawlDomain(origin, urls, opt, stats));
  return stats;
}

async function crawlDomain(origin: string, seeds: string[], opt: CrawlOptions, stats: CrawlStats) {
  const queue = [...seeds];
  const seen = new Set<string>();
  let pages = 0;

  while (queue.length && pages < opt.maxPagesPerDomain) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);

    if (!(await isAllowed(url))) { stats.blockedByRobots++; log.info('crawl', `robots.txt blocks ${url}`); continue; }
    await sleep(Math.max(opt.minDelayMs, (await crawlDelayMs(url)) ?? 0)); // be polite

    try {
      const page = await safeFetch(url, { maxBytes: config.limits.htmlBytes, allowedTypes: /text\/html|xhtml/i });
      pages++; stats.pages++;
      const html = page.buffer.toString('utf8');
      if (opt.followLinks) for (const l of extractLinks(html, page.finalUrl).slice(0, 5)) queue.push(l);

      const imgs = extractImages(html, page.finalUrl).slice(0, opt.maxImagesPerPage);
      for (const imageUrl of imgs) {
        stats.imagesSeen++;
        await indexImage(page.finalUrl, imageUrl, opt, stats);
      }
      log.info('crawl', `${url} -> ${imgs.length} images (indexed so far: ${stats.indexed})`);
    } catch (e) {
      stats.errors++;
      log.debug('crawl', `${url}: ${(e as Error).message}`);
    }
  }
}

async function indexImage(pageUrl: string, imageUrl: string, opt: CrawlOptions, stats: CrawlStats) {
  const store = getStore();
  if (store.has(imageUrl)) return;
  try {
    if (!(await isAllowed(imageUrl))) { stats.blockedByRobots++; return; }
    await sleep(opt.minDelayMs / 3);
    const { buffer } = await safeFetch(imageUrl, { maxBytes: config.limits.candidateImageBytes, allowedTypes: /^image\// });
    const { width, height } = await dims(buffer);
    if (width < 128 || height < 128) return; // icons, avatars, tracking pixels

    const norm = await normalize(buffer);
    if ((await classifyNsfw(norm)) !== 'safe') { stats.droppedExplicit++; return; } // NSFW gate: drop, do not index
    const embedder = await getEmbedder();
    store.add({ pageUrl, imageUrl, phash: await phash(norm), embedding: await embedder.embed(norm), embedder: embedder.name });
    stats.indexed++;
  } catch (e) {
    stats.errors++;
    log.debug('crawl', `image ${imageUrl}: ${(e as Error).message}`);
  }
}
