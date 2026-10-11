// Index a LOCAL folder into the own-index (no network). Perfect for controlled tests:
//   npm run index:folder -- testdata/originals
// Records point at file:// URLs and keep localPath so the verifier can read the bytes from disk.
import fs from 'node:fs';
import path from 'node:path';
import { getStore } from '../src/index/vectorStore';
import { getEmbedder } from '../src/fingerprint/embed';
import { phash } from '../src/fingerprint/phash';
import { normalize } from '../src/util/image';

async function main() {
  const dir = path.resolve(process.argv[2] ?? 'testdata/originals');
  const store = getStore();
  const embedder = await getEmbedder();
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
    const abs = path.join(dir, f);
    const norm = await normalize(fs.readFileSync(abs));
    const url = `file://${abs}`;
    if (store.add({ pageUrl: url, imageUrl: url, localPath: abs, phash: await phash(norm), embedding: await embedder.embed(norm), embedder: embedder.name })) n++;
  }
  console.log(`Indexed ${n} new images from ${dir} (store size: ${store.size}).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
