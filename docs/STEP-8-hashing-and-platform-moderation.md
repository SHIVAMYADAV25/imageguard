# Step 8: On-device hashing (StopNCII-style) + platform-side moderation

## Why
StopNCII's model (verified against stopncii.org, Oct 2026): the **hash is created on the victim's device**, only the hash is sent, participating platforms compare new uploads against it and send matches to moderation. PDQ/PhotoDNA are used for photos and **MD5 for videos**; a video hash does **not** cover its thumbnail (so you hash screenshots too); cropped/filtered/trimmed copies may need their own hash; it only covers participating platforms.

## What was built
- `hashing/pdq.ts`: a PDQ-**style** 256-bit hash (luma → 64×64 → DCT → 16×16 block → median), quality score, and all **8 dihedral orientations** (rotations/flips). `createHashPackage` produces the small JSON that is the only thing that would leave a device.
  **Honesty:** this is a re-implementation of the recipe, *not* Meta's reference code, so it is **not bit-compatible with StopNCII and cannot be submitted to it.** A real victim creates the hash on stopncii.org. For true interop, use Meta's open-source PDQ (ThreatExchange/pdq). The CLI prints this reminder every time a case is created.
- `moderation/blocklist.ts`: the platform-side hash list (hashes only; entries can be withdrawn, as StopNCII cases can).
- `moderation/checkUpload.ts`: the upload gate: hash → compare → NSFW classify → **block / review / allow**. Matches are *held for review*, not silently deleted (StopNCII: "sent for moderation"). Low-quality hashes (flat images) go to a human instead of auto-blocking. Near-misses go to review.
- API: `POST /moderation/hashes`, `POST /moderation/check`.

## Measured on a real photo (threshold 31/256, Meta's suggested value)
| edit | distance | decision |
|---|---|---|
| re-encode (q85/q30) | 0 | block |
| resize 50% | 6 | block |
| mirror | 0 | block (dihedral) |
| grayscale / tint / brightness | 8 / 6 / 12 | block |
| watermark | 14 | block |
| **crop 80% / white border / rotate 7°** | **114** | **missed** |
| different photo | ~122 | allow |

The misses are expected and match StopNCII's own caveat: that is the gap discovery + takedown tracking fills.

## Files
**Created:** `src/hashing/pdq.ts`, `src/moderation/blocklist.ts`, `src/moderation/checkUpload.ts`, `scripts/platform-demo.ts`
**Modified:** `src/api.ts` (moderation endpoints), `package.json` (scripts)
