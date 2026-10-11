# Step 2: One connector (Google Lens via SerpApi) end-to-end through the pipeline

**Goal:** a complete vertical slice: upload → guard → fingerprint → discovery → result.

## What was built / why
- **Intake guard** (`intake/*`): file validation (real header sniffing, size, min dims), **adult attestation** (minors referred to NCMEC/IWF, pluggable age estimator), **ownership declaration**. Without these the engine is a stalking tool, so they come before any search code.
- **Safe fetcher** (`util/http.ts`): SSRF protection (blocks private/loopback/metadata IPs, re-checked on every redirect, default ports only), size caps, content-type checks. Also `fetchJson` for trusted provider APIs (errors never leak API keys).
- **Temp image host** (`hosting/tempHost.ts`): Lens/Yandex fetch images by URL. We serve the normalized, EXIF-stripped image from the user's own machine via a tunnel, with a 256-bit random token, 2-minute TTL, revoked right after discovery.
- **Connector interface** (`connectors/types.ts`): one interface, `enabled()` / `needsPublicUrl` / `search()`. Adding a source = one file + one line.
- **Google Lens connector** (`connectors/serpapiLens.ts`): reads `exact_matches` and `visual_matches` defensively.
- **Pipeline** (`pipeline.ts`): parallel connectors with per-connector timeouts; one failing provider never kills the search; report with connector stats and warnings.
- **CLI** (`cli.ts`) and **API** (`api.ts`).

## Files
**Created**
`src/intake/validate.ts`, `src/intake/minorGate.ts`, `src/intake/ownership.ts` (declaration tier), `src/util/http.ts`, `src/hosting/tempHost.ts`, `src/connectors/types.ts`, `src/connectors/serpapiLens.ts`, `src/connectors/index.ts`, `src/pipeline.ts`, `src/cli.ts`, `src/api.ts`

**Modified:** `src/types.ts` (added SearchQuery / Candidate / MatchResult contracts), `src/config.ts` (provider keys, host settings, limits)

## Test
Refusal paths verified: missing adult attestation → `REFUSED [minor_or_unconfirmed]` + referral; missing ownership → `REFUSED [no_declaration]`.
Live: set `SERPAPI_KEY` + `PUBLIC_BASE_URL`, then `npm run search -- --image-url <public image> --i-am-owner --i-am-adult`.
