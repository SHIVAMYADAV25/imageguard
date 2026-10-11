# ImageGuard Engine

**Image + text in → exact / near-duplicate / similar / possible-deepfake matches out, each with the website that hosts it.**

A standalone TypeScript toolkit for leaked-image victims, built for testing. Four capabilities:

| | |
|---|---|
| **Protect** | on-device PDQ-style hashing + a platform-side upload gate (block / review / allow), modelled on StopNCII |
| **Discover** | the engine below: reverse-image providers + own index + text/OCR hints, verified by recomputed similarity |
| **Remove** | takedown drafts (India IT Rules 3(2)(b) · US TAKE IT DOWN Act · generic · DMCA · search de-listing) |
| **Track** | case ledger (hash-chained, tamper-evident), deadlines + escalation, re-checks, evidence export |

Start with `npm run demo` (offline, no keys, non-explicit stand-in photo) and read `docs/REAL_WORLD_CASES.md`.

```
USER INPUT (image + keywords/usernames/URLs)
   │
   ▼  1 INTAKE + GUARD   validate · adult attestation · ownership gate · (selfie check)
   ▼  2 FINGERPRINT      SHA-256 · pHash (+mirror) · CLIP embedding (+mirror) · [face + face-masked embedding] · OCR
   ▼  3 DISCOVERY        Google Lens · Yandex · TinEye · text/username search · own vector index   (parallel, timeouts)
   ▼  4 VERIFY + RANK    merge/dedupe · sandboxed fetch · recompute similarity · classify · NSFW · deepfake logic
   ▼  5 RESULT           {matchType, score, reasons, signals, domain, pageUrl, imageUrl, pixelated thumb, report URL}
```

## Quick start

```bash
npm install
cp .env.example .env            # add SERPAPI_KEY and/or TINEYE_API_KEY
npm run models                  # downloads ONNX models (CLIP, face, NSFW) - see "Models"
npm run testdata                # public-domain test images + face samples
npm run step1                   # does the fingerprint survive crop/filter/recompress?
npm run eval                    # precision/recall on synthetic variants (offline)
npm run index:folder -- testdata/originals
npm run search -- --image testdata/originals/great_wave.jpg --i-am-owner --i-am-adult
```

Node 20+ required. See `docs/REAL_WORLD_TESTS.md` for the full test plan with expected results.

## Match types (how each is decided: `src/rank/score.ts`)

| Type | Meaning | Signal |
|---|---|---|
| `exact` | Same picture, re-encoded/resized | pHash distance ≤ 3 **and** embedding cosine ≥ 0.97 (not mirrored), or identical bytes |
| `near_duplicate` | Same picture, edited (crop, filter, mirror, watermark) | pHash ≤ 12 with decent embedding, or cosine ≥ 0.92 |
| `similar` | Same subject/scene, different pixels | cosine ≥ 0.84 |
| `possible_deepfake` | Face-swap structure | **(a)** your body/background matches (masked-embedding ≥ 0.88) but the face does not (ArcFace ≤ 0.20); **(b)** your face in a different scene **only if** an artifact detector also fires |

Always labelled *possible*, never a verdict. All thresholds live in `src/config.ts` and `src/fingerprint/embed.ts`; calibrate them with `npm run eval`.

## Safety design (built in, not optional)

- **Attestations required:** `--i-am-owner` and `--i-am-adult`; otherwise the search is refused (minors are referred to NCMEC Take It Down / IWF).
- **Face features are gated:** face and deepfake-region analysis run only after a selfie matches the upload's face. Face matches alone are **never** reported without synthetic-artifact evidence. The engine re-scores candidates the providers returned; it does not search the web "by face".
- **Pixelated thumbnails** for anything not clearly safe; the engine never stores explicit media.
- **Own crawler:** obeys robots.txt (fail-closed), rate-limits per domain, stores only `{url, pHash, embedding}`, **drops explicit images at ingestion**, and refuses to start without the NSFW model.
- **Outbound fetches are SSRF-guarded** and size-capped; EXIF is stripped; the temp image URL is random, short-lived and revoked after discovery.

## Coverage reality (read this)

- **Bing Visual Search API was retired in Aug 2025**, so it is not used. Providers: Google Lens + Yandex (via SerpApi) and TinEye.
- Adult tube sites and leak forums are found **only if the reverse-image providers have indexed them**. They are intentionally *not* in the crawl seed list.
- Instagram / Facebook / TikTok are login-walled: you only see what search engines indexed, plus URLs the user supplies (`--urls`), which are verified.
- Telegram, Discord, DMs: out of reach. Pair with **StopNCII** for proactive blocking.
- Deepfake detection is probabilistic; ORB/SIFT local-feature matching is not implemented (crops rely on the CLIP embedding).

## Models (`npm run models`; all optional, graceful fallback)

| File in `models/` | Used for | Without it |
|---|---|---|
| `clip_vision.onnx` (Xenova CLIP ViT-B/32) | similar / crop / edit matching | WEAK 16×16 thumbnail fallback (misses crops/rotations) |
| `scrfd.onnx` (InsightFace det_10g, **5 landmarks → aligned faces**) + `arcface.onnx` (w600k_r50) | ownership selfie check, face + masked-region deepfake logic | face analysis disabled |
| `face_detector.onnx` (UltraFace, boxes only) | fallback detector if SCRFD is absent (lower accuracy: no alignment) | uses SCRFD or nothing |
| *(bundled in npm)* PaddleOCR PP-OCRv4 via `@gutenye/ocr-node` | handles/watermark domains from screenshots | n/a (ships with `npm install`) |
| `nsfw_nudenet.onnx` (NudeNet 320n) | NSFW labels, pixelation, crawler gate | labels `unknown` (pixelated); **crawler refuses to run** |
| `deepfake_detector.onnx` (bring your own) | extra evidence for rule (b) | rule (b) never fires |

The script rejects HTML error pages saved as models. If a download fails, fetch the file manually into `models/`.

## Commands

| Command | What |
|---|---|
| `npm run search -- --image f.jpg --i-am-owner --i-am-adult [--selfie s.jpg] [--keywords a,b] [--usernames x] [--urls u1,u2] [--image-url U] [--json]` | run the engine |
| `npm run api` | Fastify API: `POST /search` (multipart), `GET /blobs/:id` |
| `npm run step1 -- img.jpg [other.jpg]` | fingerprint robustness table |
| `npm run eval` | offline precision/recall harness |
| `npm run variants -- me.jpg [donor.jpg]` | generate labelled test variants |
| `npm run index:folder -- dir` | index a local folder |
| `npm run crawl -- [--limit-seeds N --max-pages N --max-images N --follow]` | crawl `data/seeds/seed-urls.txt` (100 seeds) |
| `npm run demo [-- --image f.jpg --jurisdiction IN]` | the whole protect → gate → discover → takedown → track story, offline |
| `npm run case -- new\|add-url\|verify\|draft\|report\|respond\|recheck\|status\|export` | case tracking CLI |
| `npm run platform -- f.jpg` | which edited copies would a hash gate catch? |
| `npm run testpack -- f.jpg` | build a rehearsal pack (variants, fake post screenshot for OCR, hostable page) |
| `npm run faces` | check SCRFD landmarks / ArcFace matrix on `testdata/faces` |
| `npm run typecheck` | `tsc --noEmit` |

## Google Lens / Yandex need a public image URL

SerpApi fetches by URL. Run a tunnel to the built-in temp host and set `PUBLIC_BASE_URL`:
```bash
cloudflared tunnel --url http://localhost:8787     # or: ngrok http 8787
# put the https URL into .env as PUBLIC_BASE_URL
```
Or pass `--image-url` if the image is already public. TinEye uploads directly and needs no URL. Note that the provider (SerpApi → Google/Yandex) *does* receive the image.

## Folder map

```
src/intake/       validate.ts · minorGate.ts · ownership.ts
src/fingerprint/  phash.ts · embed.ts · face.ts · mask.ts · ocr.ts · index.ts
src/connectors/   serpapiLens · yandex · tineye · textSearch · ownIndex · index · types
src/crawler/      robots.ts · worker.ts          src/index/vectorStore.ts
src/verify/       fetcher · rescore · verifier · nsfw · deepfake · blobs
src/rank/         score.ts · merge.ts            src/registry/  domains.json · registry.ts
src/hosting/      tempHost.ts                    src/util/      http · html · image · math · log
src/eval/         transforms.ts · harness.ts     src/pipeline.ts · cli.ts · api.ts
scripts/          download-models.sh · download-testdata.ts · crawl.ts · index-folder.ts · step1-… · gen-variants.ts
data/seeds/seed-urls.txt   (100 crawlable seeds)      docs/   per-step build notes + test plan
```

## Build log
`docs/STEP-1-…` through `docs/STEP-11-…`: what was built, why, and exactly which files were created/modified. Steps 8–11 add hashing + moderation, case tracking + takedown, the SCRFD face stack, and PaddleOCR.

## Known limitations / not production
- Provider response shapes (SerpApi Lens/Yandex, TinEye auth header) were written from public docs and are parsed defensively; verify with a live key.
- Face stack: SCRFD+alignment is unit-tested (decoder, transform, warp) but the real `scrfd.onnx`/`arcface.onnx` files were not runnable in the build sandbox: run `npm run faces` to confirm on your machine.
- The PDQ-style hash is **not** bit-compatible with StopNCII: real protection means hashing on stopncii.org.
- Age gate = attestation only until you plug in an estimator (`registerAgeEstimator`). Selfie check has no liveness.
- Vector store is brute-force JSONL; queue is in-process `Promise.allSettled` (swap for pgvector/Qdrant and BullMQ).
- Registry report URLs are starting points; re-verify before relying on them.
- DNS-rebinding gap in `safeFetch` (documented in the file).
