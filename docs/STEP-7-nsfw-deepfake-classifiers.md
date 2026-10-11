# Step 7: NSFW and deepfake classifiers

## What was built / why
- **NSFW** (`verify/nsfw.ts`): NudeNet v3 (YOLOv8, 320 px) in ONNX. Takes the max score per class; any *exposed* intimate class ≥ 0.45 → `explicit`, covered classes ≥ 0.5 → `suggestive`, else `safe`. Deliberately conservative. Drives (1) the label, (2) **pixelated thumbnails** for anything not `safe`/`unknown`, (3) the crawler's ingestion gate. It never skips verification.
- **Deepfake artifact detector** (`verify/deepfake.ts`): optional BYO ONNX binary classifier (`models/deepfake_detector.onnx`). A **weak** signal only; it is computed only when the face already matches, and it is what unlocks rule (b) in Step 6. Contract documented in the file header.
- **Thumbnail privacy** (`util/image.ts → pixelatedThumb`): shrink to 20 px and scale up with nearest-neighbour: irreversible.

## Files
**Created:** `src/verify/nsfw.ts`, `src/verify/deepfake.ts`
**Modified:** `src/verify/verifier.ts` (NSFW label, artifact score, thumbnail policy), `src/crawler/worker.ts` (explicit-image gate), `src/rank/score.ts` (artifact boost / rule b), `src/util/image.ts` (`pixelatedThumb`, `plainThumb`)

## Not verified here
The NudeNet release asset could not be downloaded in the build sandbox (GitHub release redirects were blocked), so class order and output layout follow the published v3 format and the code handles both `[1,22,N]` and `[1,N,22]`. Test with `npm run models` then `npm run search` on a known-safe and a known-nude test image *you are entitled to use*; if labels look inverted, check the `LABELS` array.
