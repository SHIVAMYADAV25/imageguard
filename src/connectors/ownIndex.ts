// Connector B: our own vector index (crawled permitted pages + locally indexed folders).
// Retrieval = nearest neighbours by embedding + by pHash. Results go through the SAME verifier
// as every other connector, so the index never gets to "vouch" for itself.
import { Candidate } from '../types';
import { getStore } from '../index/vectorStore';
import { DiscoveryConnector } from './types';
import fs from 'node:fs';

export const ownIndex: DiscoveryConnector = {
  name: 'own_index',
  needsPublicUrl: false,
  enabled: () => getStore().size > 0,

  async search(_q, fp) {
    const store = getStore();
    const hits = new Map<string, Candidate>();
    const add = (r: ReturnType<typeof store.searchByEmbedding>[number]['record']) => {
      if (hits.has(r.id)) return;
      hits.set(r.id, {
        pageUrl: r.pageUrl,
        imageUrl: r.imageUrl,
        // Locally indexed test images are read straight from disk (no network).
        inlineImage: r.localPath && fs.existsSync(r.localPath) ? fs.readFileSync(r.localPath) : undefined,
        source: 'own_index',
      });
    };
    for (const h of store.searchByEmbedding(fp.embedding, fp.embedderName, 25, 0.6)) add(h.record);
    for (const h of store.searchByPhash(fp.phash, 14, 25)) add(h.record);
    for (const h of store.searchByPhash(fp.phashFlipped, 14, 25)) add(h.record);
    return [...hits.values()];
  },
};
