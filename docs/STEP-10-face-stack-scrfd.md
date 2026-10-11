# Step 10: Face stack upgrade: SCRFD + 5-point alignment + ArcFace

## Why
ArcFace is trained on faces warped so eyes/nose/mouth sit at fixed positions in a 112×112 image. The earlier detector (UltraFace) gave boxes only, so faces were cropped *unaligned*: rotation and scale became "identity noise". SCRFD (the detector InsightFace pairs with ArcFace) returns **5 landmarks**, enabling proper alignment.

## What was built
- `fingerprint/scrfd.ts`: SCRFD `det_10g` decoder (3 strides × 2 anchors, bbox + 5 keypoints, NMS), following InsightFace's reference decoding.
- `fingerprint/align.ts`: closed-form least-squares **similarity transform** (rotation+scale+translation) from the 5 landmarks to the ArcFace template, bilinear warp to 112×112.
- `fingerprint/face.ts`: uses SCRFD + alignment when `models/scrfd.onnx` exists, otherwise falls back to UltraFace + square crop. `detectorName()` reports which path is active.
- `fingerprint/boxes.ts`: shared IoU/NMS.
- `scripts/check-faces.ts` (`npm run faces`): detector report, annotated images (box + landmarks) in `testdata/out/`, and an ArcFace cosine matrix.
- `download-models.sh` now extracts both `det_10g.onnx → scrfd.onnx` and `w600k_r50.onnx → arcface.onnx` from `buffalo_l.zip`.

## Verified here / not verified
**Unit-tested (13 checks, all pass):** the decoder against a synthetic output tensor (exact box + keypoints), the similarity estimator (translation, 2× scale, 30° rotation recovered exactly), and the warp (known shifts/scales land on the right pixels).
**Not verified:** the actual `det_10g.onnx` / `arcface.onnx` files (the build sandbox could not download them). Run `npm run models && npm run faces`: the annotated images should show a green box with 4–5 red dots on eyes/nose/mouth, and the matrix should show `obama`↔`obama2` clearly above `obama`↔`biden`. If the output order differs for your SCRFD file, `scrfd.ts` throws a clear error (expects 9 outputs).

## Files
**Created:** `src/fingerprint/scrfd.ts`, `src/fingerprint/align.ts`, `src/fingerprint/boxes.ts`, `scripts/check-faces.ts`
**Modified:** `src/fingerprint/face.ts` (rewritten to prefer SCRFD + alignment), `src/types.ts` (`FaceBox.kps`), `scripts/download-models.sh`
