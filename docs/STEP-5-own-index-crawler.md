# Step 5: Own index and crawler (100 permitted seed URLs)

## What was built / why
- **Vector store** (`index/vectorStore.ts`): JSONL + brute-force cosine/Hamming search. Stores `{pageUrl, imageUrl, pHash, embedding, embedder}`, **never image bytes**. Embeddings from different models are never compared.
- **Own-index connector** (`connectors/ownIndex.ts`): nearest neighbours by embedding and pHash (also the mirrored hash). Results go through the **same verifier** as every provider.
- **Crawler** (`crawler/robots.ts`, `crawler/worker.ts`): robots.txt obeyed for pages *and* image hosts (4xx = allow, 5xx/network = **fail closed**), Crawl-delay honoured, ≥1.5 s per domain, one request at a time per domain, static HTML only, 128 px minimum, **explicit images dropped at ingestion**, refuses to start without the NSFW model.
- **Seed list** (`data/seeds/seed-urls.txt`): exactly **100** URLs: open-licence stock libraries, Wikimedia/Wikipedia, museum open-access collections, NASA/ESA/NOAA/NPS and other government archives. **Adult, leak and login-walled sites are deliberately excluded**: a crawler pointed at such sites would ingest non-consensual and potentially illegal material; coverage there comes from the reverse-image providers.
- **Local index script** (`scripts/index-folder.ts`): index a folder offline: ideal controlled test corpus.

## Files
**Created:** `src/index/vectorStore.ts`, `src/connectors/ownIndex.ts`, `src/crawler/robots.ts`, `src/crawler/worker.ts`, `data/seeds/seed-urls.txt`, `scripts/crawl.ts`, `scripts/index-folder.ts`
**Modified:** `src/connectors/index.ts` (registered ownIndex), `src/util/html.ts` (`extractLinks`)

## Test
`npm run crawl -- --limit-seeds 5` then `npm run search -- --image <a-photo-from-those-sites> --i-am-owner --i-am-adult`.
Verified here: crawler refuses to start without the NSFW model; local-folder index → pipeline finds mirrored/watermarked copies. Live crawling could not be run in the build sandbox (no general internet).
