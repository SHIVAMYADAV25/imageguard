# Step 1: Fingerprint module (pHash + CLIP)

**Goal:** prove that the signals survive crops, filters and recompression before building anything on top.

## What was built / why
- **pHash** (`phash.ts`): DCT-based 64-bit hash. Survives resize/recompress/colour edits; compared by Hamming distance. A hash of the **mirrored** image is also kept, because pHash is not mirror-invariant.
- **Embedding** (`embed.ts`): CLIP ViT-B/32 through `onnxruntime-node` for "same picture, heavily edited" and "similar scene". Falls back to a weak 16×16 thumbnail embedding so the pipeline runs without models. Each embedder carries its own **calibration thresholds**, because cosine scales differ by model.
- **Normalization** (`util/image.ts`): EXIF rotation, flatten alpha, cap size, re-encode (this also strips EXIF/GPS) so upload and candidates are fingerprinted identically.
- **OCR** (`ocr.ts`, optional): pulls @handles from screenshots for text search later.
- **Variant generator** (`eval/transforms.ts`): 13 labelled transforms (re-encode, resize, crop, mirror, grayscale, tint, brightness, border, watermark, rotate) used by the test script and later the harness.
- **Test script** (`scripts/step1-fingerprint-test.ts`): table of pHash distance + cosine per transform, plus a control against a different image.

## Files
**Created**
`package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `src/config.ts`, `src/types.ts`, `src/util/log.ts`, `src/util/math.ts`, `src/util/image.ts`, `src/fingerprint/phash.ts`, `src/fingerprint/embed.ts`, `src/fingerprint/ocr.ts`, `src/fingerprint/index.ts`, `src/eval/transforms.ts`, `scripts/step1-fingerprint-test.ts`, `scripts/gen-variants.ts`, `scripts/download-models.sh`, `scripts/download-testdata.ts`

**Modified:** none (first step).

## Result observed (fallback embedder, real photo)
Re-encode / resize / JPEG q30 → pHash distance 0. Mirror → distance 0 (via mirrored hash). Grayscale/tint/brightness/watermark → matched. Crop, border, rotate → pHash alone misses these (distance 16–32), and the **weak fallback embedder** also misses them: this is exactly the gap CLIP is there to close. Control (different person) → no match.

## How to run
`npm run testdata && npm run models && npm run step1 -- testdata/originals/great_wave.jpg testdata/originals/starry_night.jpg`
