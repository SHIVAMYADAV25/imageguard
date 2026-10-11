# Step 3: Verifier and scoring (+ evaluation harness)

**Goal:** accuracy. Reverse-image providers return noisy candidates; we never trust their scores.

## What was built / why
- **Sandboxed fetcher** (`verify/fetcher.ts`): downloads the candidate image (full-size, then provider thumbnail as fallback). Never renders pages.
- **Rescore** (`verify/rescore.ts`): split into `analyzeCandidate` (expensive: decode, pHash, embedding) and `compareFeatures` (arithmetic) so the harness can compute each pool item once.
- **Classifier** (`rank/score.ts`): priority rules → `exact` / `near_duplicate` / `similar`, a 0..1 ranking score (strong evidence from *either* pHash or embedding counts, because crops kill pHash and heavy colour edits can hurt embeddings), and human-readable `reasons`.
- **Verifier** (`verify/verifier.ts`): bytes → analyze → compare → classify → result.
- **Blobs** (`verify/blobs.ts`): content-addressed thumbnail storage.
- **Eval harness** (`eval/harness.ts`): originals → ~14 labelled variants each; pool = all variants + distractors; every original is scored against the whole pool with the *same code the pipeline uses*. Reports per-variant recall, label accuracy, min cosine, overall precision, and the highest negative cosine (your tuning target).

## Files
**Created:** `src/verify/fetcher.ts`, `src/verify/rescore.ts`, `src/verify/verifier.ts`, `src/verify/blobs.ts`, `src/rank/score.ts`, `src/eval/harness.ts`
**Modified:** `src/pipeline.ts` (verify stage), `src/types.ts` (Signals), `src/config.ts` (thresholds)

## Fix found during testing
A mirrored copy had pHash distance 0 but was rejected: the embedding comparison wasn't mirror-aware. Added `embeddingFlipped` to the fingerprint (`types.ts`, `fingerprint/index.ts`, `verify/rescore.ts`) and made `exact` impossible for mirrored images (`rank/score.ts`).

## Observed (3 real photos, fallback embedder)
Precision 100% (TP 28 / FP 0). Re-encode/resize/mirror/tint/brightness/watermark: 100% recall. Crop/rotate: 0% with the weak fallback; re-run with CLIP.

Run: `npm run eval` (needs ≥2 images in `testdata/originals`; add distractors to `testdata/distractors`).
