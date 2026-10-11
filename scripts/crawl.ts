// npm run crawl -- [--seeds file] [--limit-seeds N] [--max-pages N] [--max-images N] [--follow]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config } from '../src/config';
import { crawlSeeds, defaultCrawlOptions } from '../src/crawler/worker';

async function main() {
  const { values: v } = parseArgs({
    options: { seeds: { type: 'string' }, 'limit-seeds': { type: 'string' }, 'max-pages': { type: 'string' }, 'max-images': { type: 'string' }, follow: { type: 'boolean' } },
  });
  const file = v.seeds ?? path.join(config.dataDir, 'seeds', 'seed-urls.txt');
  let seeds = fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (v['limit-seeds']) seeds = seeds.slice(0, Number(v['limit-seeds']));
  console.log(`Crawling ${seeds.length} seed URLs (robots.txt enforced, explicit images dropped)...`);
  const stats = await crawlSeeds(seeds, {
    ...defaultCrawlOptions,
    maxPagesPerDomain: Number(v['max-pages'] ?? defaultCrawlOptions.maxPagesPerDomain),
    maxImagesPerPage: Number(v['max-images'] ?? defaultCrawlOptions.maxImagesPerPage),
    followLinks: !!v.follow,
  });
  console.log('\nDone:', stats);
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
