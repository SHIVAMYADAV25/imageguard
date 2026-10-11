# Step 6: Face and masked-region scoring (deepfake logic)

## The idea
- Face swapped **onto your photo**: body/background/pose match; the face does not.
- **Your face** put in another scene: the face matches; body/background do not.

So the image is scored as two regions: the **face** (ArcFace) and **everything else** (CLIP on the image with the face painted gray).

## What was built / why
- **Face detector + ArcFace** (`fingerprint/face.ts`): UltraFace RFB-640 boxes + w600k_r50 512-d embeddings via ONNX. *Limitation:* no landmarks → no alignment.
- **Masking** (`fingerprint/mask.ts`): gray patch over the expanded face box.
- **Ownership gate, tier 2** (`intake/ownership.ts`): a selfie must match the face in the upload (cosine ≥ 0.40) before any face feature is computed. Otherwise those features stay off.
- **Scoring rules** (`rank/score.ts`): (a) body match ≥ 0.88 and face ≤ 0.20 → `possible_deepfake`; (b) face ≥ 0.35 in a different scene → reported **only with artifact evidence** (Step 7), otherwise dropped. This also prevents the engine from turning into a "find every photo of this person" tool.
- **Face-swap simulator** (`eval/transforms.ts`): pastes a donor face over the base face to create the target structure; added as the `faceswap_sim` variant in the harness.

## Files
**Created:** `src/fingerprint/face.ts`, `src/fingerprint/mask.ts`
**Modified:** `src/fingerprint/index.ts` (face + masked embeddings), `src/intake/ownership.ts` (selfie tier), `src/verify/rescore.ts` (candidate face + masked embedding, `face`/`bodyOrBg` signals), `src/rank/score.ts` (deepfake rules), `src/types.ts` (face fields), `src/eval/transforms.ts` (`simulateFaceSwap`), `src/eval/harness.ts` (face-swap variant)

## Verified here / not verified
Verified: UltraFace detects exactly one face in each of 3 real portraits. **Not verified:** ArcFace thresholds (0.35 / 0.20 / 0.40 are literature-based starting points; model download was blocked in the build sandbox). Calibrate with `npm run eval` + `testdata/faces` (obama / obama2 = same person, biden = different).
