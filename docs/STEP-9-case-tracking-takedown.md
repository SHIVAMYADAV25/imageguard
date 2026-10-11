# Step 9: Case tracking, takedown drafts, re-checks, evidence export

## Why
Documented victims (see `REAL_WORLD_CASES.md`) spent months emailing site after site, re-reporting re-uploads, with no record of what was sent or when. A case file turns that into something a helpline, lawyer or court can use, and starts the platform's legal clock.

## What was built
- **Case store** (`cases/store.ts`): a case holds **fingerprints and metadata only, never the image**. Tracks URLs through `discovered → verified → reported → removed` (or `rejected` / `unreachable`).
- **Hash-chained ledger:** every event commits to the previous one (SHA-256 chain). Editing, deleting or reordering any event breaks verification: the demo proves it.
- **Verification of a pasted URL:** open the page, take its images, run the same verifier as the discovery engine against the stored fingerprint. Direct image links work too.
- **Re-check:** page gone (404/410) or matching image no longer on the page → `removed`; still matching → unchanged. *Caveat:* a geo-block or a JS-only page can look like removal; treat it as a prompt to look, not proof.
- **Takedown drafts** (`cases/takedown.ts`): drafts only, nothing is sent, no image is embedded or described:
  - **IN:** complaint under IT Rules 2021 **Rule 3(2)(b)**, removal within **24 h** of complaint, with NCRP (cybercrime.gov.in) and Grievance Appellate Committee (gac.gov.in) escalation. MeitY issued an NCII SOP in late 2025.
  - **US:** TAKE IT DOWN Act request (content location, good-faith non-consent statement, identity, contact, signature): **48 h**, plus identical copies; FTC enforcement since 19 May 2026.
  - **UK/OTHER:** generic NCII notice. **DMCA** template (only if *you* took the image) and Google **search de-listing** guidance.
- **Deadlines:** reporting stamps a statutory deadline (IN 24 h, US 48 h); `status` flags `OVERDUE` with the escalation route.
- **Evidence export** (`cases/export.ts`): markdown for a helpline/lawyer: hashes, tracked URLs, match evidence, reports, timeline, and ledger integrity. No images.
- **CLI** (`casecli.ts`): `new | list | add-url | verify | draft | report | respond | recheck | status | export`.

Drafts are **not legal advice**; statutes were checked against public sources in Oct 2026: have a lawyer/helpline review before a dispute.

## Files
**Created:** `src/cases/types.ts`, `src/cases/store.ts`, `src/cases/takedown.ts`, `src/cases/export.ts`, `src/casecli.ts`, `scripts/demo-case.ts`
**Modified:** `src/util/http.ts` (`ALLOW_PRIVATE_HOSTS=1` test-only escape hatch so the demo can fetch from a local server; off by default, prints a warning), `package.json`
