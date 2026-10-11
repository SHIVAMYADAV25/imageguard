# Real-world test plan

Setup once: `npm install && cp .env.example .env` (add `SERPAPI_KEY`, optionally `TINEYE_API_KEY`) · `npm run models` · `npm run testdata`.
For Lens/Yandex also run a tunnel (`cloudflared tunnel --url http://localhost:8787`) and set `PUBLIC_BASE_URL`.

> For artwork/public-domain tests the attestations are a formality (`--i-am-owner --i-am-adult`). For tests involving a person, **use only your own photos or a consenting adult's**.

| # | Test | Command | Expected |
|---|---|---|---|
| 1 | Fingerprint robustness | `npm run step1 -- testdata/originals/great_wave.jpg testdata/originals/starry_night.jpg` | re-encode/resize/mirror/tint/watermark MATCH; with CLIP also crops/rotate; CONTROL = no match |
| 2 | Offline accuracy | `npm run eval` | precision ≥ 95%; recall 100% on exact/near variants; look at "highest negative cosine" and tune `embed.ts` |
| 3 | Offline end-to-end | `npm run index:folder -- testdata/originals` then `npm run variants -- testdata/originals/mona_lisa.jpg` then `npm run search -- --image testdata/variants/mona_lisa/mirror.jpg --i-am-owner --i-am-adult` | `near_duplicate` (mirror) pointing at `mona_lisa.jpg`, found by `own_index` |
| 4 | Live reverse search (public image) | `npm run search -- --image-url "https://commons.wikimedia.org/wiki/Special:FilePath/The_Great_Wave_off_Kanagawa.jpg?width=1024" --i-am-owner --i-am-adult` | dozens of `exact`/`near_duplicate` hits on wikimedia, museum, print-shop sites; `foundBy` lists several providers |
| 5 | Live search, your own photo | `npm run search -- --image me.jpg --i-am-owner --i-am-adult` | hits on every public profile/page where that exact photo is indexed; none otherwise (that is a valid result) |
| 6 | Known-URL verification (deterministic) | put `npm run variants -- me.jpg` outputs on a public page you control, then `npm run search -- --image me.jpg --urls https://your-page --i-am-owner --i-am-adult` | each variant on the page verified: `exact` / `near_duplicate` / `similar` per the variant table |
| 7 | Username/text discovery | `npm run search -- --image me.jpg --usernames yourhandle --keywords "yourname" --i-am-owner --i-am-adult` | text-search candidates expanded and verified; only pages that really contain your image survive |
| 8 | Deepfake structure | `npm run variants -- me.jpg donor_face.jpg` → host `faceswap_sim.jpg` on your page → `npm run search -- --image me.jpg --selfie me2.jpg --urls <page> --i-am-owner --i-am-adult` | `possible_deepfake` with reason "body/background matches but face does not" (requires face models + a face in the image) |
| 9 | Ownership selfie gate | `... --image testdata/faces/obama.jpg --selfie testdata/faces/obama2.jpg` vs `--selfie testdata/faces/biden.jpg` | obama2: `faceAnalysis: true`; biden: warning "Selfie does not match", face analysis off |
| 10 | Negative control | search a photo you never uploaded anywhere, or a solid-colour image | 0 matches |
| 11 | Gate refusals | omit `--i-am-adult` / `--i-am-owner` | `REFUSED` with referral text |
| 12 | Crawler | `npm run crawl -- --limit-seeds 5 --max-pages 1` then search with an image from one of those sites | `own_index` finds it; robots-blocked URLs logged and skipped |
| 13 | API | `npm run api`; `curl -F image=@me.jpg -F owner=true -F adult=true localhost:3000/search` | same JSON report as CLI |

Reading results: `matchType`, `score`, `reasons` (the numbers behind the label), `signals`, `nsfw`, `foundBy`, `report` (where to report that domain), thumbnail in `data/blobs/` (pixelated unless `safe`).
Full JSON reports are saved to `data/reports/`.

## Added in steps 8-11 (all work offline, no API keys)
| # | Test | Command | Expected |
|---|---|---|---|
| 14 | Whole story | `npm run demo -- --image testdata/faces/obama.jpg --jurisdiction IN` | gate BLOCKs same/recompressed/resized/mirrored/grayscale/watermarked; ALLOWs crop/border/rotate (the documented gap); 2 of 3 links verified, unrelated one rejected; drafts + 24 h clock; re-check shows REMOVED; ledger valid, tampered copy `ok:false` |
| 15 | Hash robustness | `npm run platform -- testdata/originals/mona_lisa.jpg` | distances ~0-14 for light edits (BLOCK), >100 for crop/border/rotate (ALLOW) |
| 16 | Manual case flow | `npm run case -- new --image f.jpg --jurisdiction US` → `add-url` → `verify` → `draft` → `report` → `status` | status shows the 48 h deadline; after 48 h without `respond`, `OVERDUE → ESCALATE` |
| 17 | OCR source hints | `npm run testpack -- f.jpg` then `npm run search -- --image testdata/pack/screenshot_post.jpg --i-am-owner --i-am-adult --json` | `hints.handles` has `priya_sharma92`; `hints.domains` has `watermark-site-example.com` |
| 18 | Face stack | `npm run models && npm run faces` | detector `scrfd+landmarks+alignment`; red landmark dots on eyes/nose/mouth; cosine obama↔obama2 well above obama↔biden |
| 19 | Platform API | `npm run api`; `curl -X POST -H 'content-type: application/json' -d '{"hash":"<64hex>"}' localhost:3000/moderation/hashes`; `curl -F image=@f.jpg localhost:3000/moderation/check` | JSON decision `block` / `review` / `allow` |
