// The orchestrator: wires the five stages together.
//   1 INTAKE+GUARD -> 2 FINGERPRINT -> 3 DISCOVERY (parallel) -> 4 VERIFY+RANK -> 5 RESULT
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Candidate, MatchResult, SearchQuery } from './types';
import { config } from './config';
import { log } from './util/log';
import { mapLimit, withTimeout } from './util/math';
import { validateUpload } from './intake/validate';
import { minorGate } from './intake/minorGate';
import { verifyOwnership, OwnershipResult } from './intake/ownership';
import { computeFingerprint } from './fingerprint';
import { allConnectors } from './connectors';
import { publishTemp, TempImage } from './hosting/tempHost';
import { mergeCandidates, mergeResults } from './rank/merge';
import { expandPage } from './verify/fetcher';
import { DefaultVerifier } from './verify/verifier';
import { GLOBAL_RESOURCES } from './registry/registry';
import { extractDomains, extractHandles } from './fingerprint/ocr';

export interface ConnectorStat {
  name: string;
  status: 'ok' | 'error' | 'skipped';
  candidates: number;
  ms: number;
  note?: string;
}

export interface SearchReport {
  searchId: string;
  createdAt: string;
  durationMs: number;
  ownership: Pick<OwnershipResult, 'declared' | 'faceVerified' | 'selfieSimilarity'>;
  fingerprint: { phash: string; embedder: string; faceAnalysis: boolean };
  connectors: ConnectorStat[];
  stats: { rawCandidates: number; afterMerge: number; verified: number; matches: number };
  hints: { handles: string[]; domains: string[] }; // read from text inside the image (OCR)
  warnings: string[];
  results: MatchResult[];
  resources: typeof GLOBAL_RESOURCES;
}

type MergedCandidate = Candidate & { sources?: string[] };

export async function runSearch(q: SearchQuery): Promise<SearchReport> {
  const t0 = Date.now();
  const warnings: string[] = [];

  // ===== Stage 1: INTAKE + GUARD (throws IntakeError when the search must not run) ===========
  await validateUpload(q.imageBuffer);
  warnings.push(...(await minorGate(q.declaration, q.imageBuffer)).warnings);
  const ownership = await verifyOwnership(q);
  warnings.push(...ownership.warnings);

  // ===== Stage 2: FINGERPRINT =================================================================
  const fp = await computeFingerprint(q.imageBuffer, { withFace: ownership.faceVerified, ocr: config.enableOcr });
  log.info('fingerprint', `phash=${fp.phash} embedder=${fp.embedderName} face=${!!fp.faceEmbedding}`);

  // ===== Stage 3: DISCOVERY (all connectors in parallel, each with its own timeout) ==========
  const stats: ConnectorStat[] = [];
  const active = allConnectors.filter((c) => {
    if (!c.enabled()) { stats.push({ name: c.name, status: 'skipped', candidates: 0, ms: 0, note: 'not configured (no API key / empty index)' }); return false; }
    return true;
  });

  // URL-based connectors need a public URL of the image: user-supplied, or our temp host.
  let temp: TempImage | null = null;
  let imageUrl = q.imageUrl;
  if (!imageUrl && active.some((c) => c.needsPublicUrl)) {
    temp = await publishTemp(fp.normalizedImage);
    imageUrl = temp?.url;
    if (!imageUrl) warnings.push('PUBLIC_BASE_URL not set: Google Lens / Yandex were skipped (TinEye, text search and own index still ran).');
  }

  const raw: Candidate[] = [];
  await Promise.all(
    active.map(async (c) => {
      if (c.needsPublicUrl && !imageUrl) { stats.push({ name: c.name, status: 'skipped', candidates: 0, ms: 0, note: 'needs a public image URL' }); return; }
      const t = Date.now();
      try {
        const found = await withTimeout(c.search(q, fp, { imageUrl }), config.limits.connectorTimeoutMs, c.name);
        raw.push(...found);
        stats.push({ name: c.name, status: 'ok', candidates: found.length, ms: Date.now() - t });
      } catch (e) {
        // One failing provider must never kill the search.
        stats.push({ name: c.name, status: 'error', candidates: 0, ms: Date.now() - t, note: (e as Error).message });
      }
    }),
  );
  temp?.revoke(); // the image is no longer publicly reachable from this moment on

  // ===== Stage 4a: MERGE + EXPAND =============================================================
  let merged: MergedCandidate[] = mergeCandidates(raw);
  merged = await expandPageOnly(merged);
  merged = mergeCandidates(merged)
    // Prefer candidates several providers agree on, then provider-confident ones; cap for cost.
    .sort((a, b) => (b.sources?.length ?? 1) - (a.sources?.length ?? 1) || (b.providerScore ?? 0) - (a.providerScore ?? 0))
    .slice(0, config.limits.maxCandidates);
  log.info('merge', `${raw.length} raw -> ${merged.length} unique candidates`);

  // ===== Stage 4b: VERIFY (recompute similarity ourselves) ====================================
  const verifier = new DefaultVerifier();
  const verified = await mapLimit(merged, config.limits.verifyConcurrency, (c) =>
    verifier.verify(c, fp).catch(() => null),
  );
  const results = mergeResults(verified.filter((r): r is MatchResult => !!r));

  // ===== Stage 5: RESULT ======================================================================
  const report: SearchReport = {
    searchId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    ownership: { declared: ownership.declared, faceVerified: ownership.faceVerified, selfieSimilarity: ownership.selfieSimilarity },
    fingerprint: { phash: fp.phash, embedder: fp.embedderName, faceAnalysis: !!fp.faceEmbedding },
    connectors: stats,
    stats: { rawCandidates: raw.length, afterMerge: merged.length, verified: verified.filter(Boolean).length, matches: results.length },
    hints: { handles: extractHandles(fp.ocrText), domains: extractDomains(fp.ocrText) },
    warnings,
    results,
    resources: GLOBAL_RESOURCES,
  };
  const dir = path.join(config.dataDir, 'reports');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${report.searchId}.json`), JSON.stringify(report, null, 2));
  return report;
}

/** Candidates that are only a PAGE (text search, user URLs) are opened and replaced by the images on them. */
async function expandPageOnly(cands: MergedCandidate[]): Promise<MergedCandidate[]> {
  const hasPixels = (c: Candidate) => !!(c.imageUrl || c.thumbnailUrl || c.inlineImage);
  const ready = cands.filter(hasPixels);
  const pageOnly = cands
    .filter((c) => !hasPixels(c))
    .sort((a, b) => Number(b.source === 'user_url') - Number(a.source === 'user_url')) // user's own URLs first
    .slice(0, config.limits.maxPageExpansions);

  const expanded = await mapLimit(pageOnly, 4, async (c) => {
    try {
      const urls = await expandPage(c.pageUrl, config.limits.imagesPerExpandedPage);
      return urls.map((u): MergedCandidate => ({ ...c, imageUrl: u }));
    } catch (e) {
      log.debug('expand', `${c.pageUrl}: ${(e as Error).message}`);
      return [];
    }
  });
  return [...ready, ...expanded.flat()];
}
