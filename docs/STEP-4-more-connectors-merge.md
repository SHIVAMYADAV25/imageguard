# Step 4: Second and third connectors + merge/dedupe

## What was built / why
- **Yandex** (`connectors/yandex.ts`): SerpApi `engine=yandex_images&url=`; strong on non-English web and person-level similarity.
- **TinEye** (`connectors/tineye.ts`): direct image **upload** (no public URL needed), strong on exact/near-exact; returns real page + image URLs per backlink.
- **Bing was dropped:** the Bing Visual Search API was retired in Aug 2025.
- **Text search** (`connectors/textSearch.ts`): known URLs become candidates directly; usernames, keywords and OCR'd @handles become a few SERP queries (capped). The engine adds **no sexual/"leak" terms** of its own.
- **Page expansion** (`pipeline.ts` + `verify/fetcher.ts` + `util/html.ts`): page-only candidates are opened and replaced by the images on them (og:image first), so text hits can be verified visually.
- **Merge** (`rank/merge.ts`): canonical URLs (strip www/m., tracking params, fragments, trailing slash), candidate dedupe with `foundBy` union (provider agreement is evidence), result dedupe per page, ordering `exact → possible_deepfake → near_duplicate → similar`.
- **Registry** (`registry/*`): domain → report channel (+ StopNCII / Take It Down / Google removal) for "Source identification".

## Files
**Created:** `src/connectors/yandex.ts`, `src/connectors/tineye.ts`, `src/connectors/textSearch.ts`, `src/rank/merge.ts`, `src/util/html.ts`, `src/registry/domains.json`, `src/registry/registry.ts`
**Modified:** `src/connectors/index.ts`, `src/pipeline.ts` (merge + expand + resources), `src/verify/verifier.ts` (attach report info), `src/verify/fetcher.ts` (`expandPage`)
