// Case persistence, hash-chained ledger, URL verification and re-checking.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config';
import { Candidate, Fingerprint } from '../types';
import { computeFingerprint } from '../fingerprint';
import { createHashPackage } from '../hashing/pdq';
import { b64ToF32, f32ToB64, sha256 } from '../util/math';
import { canonicalUrl, mergeResults } from '../rank/merge';
import { expandPage, fetchImageBytes } from '../verify/fetcher';
import { DefaultVerifier } from '../verify/verifier';
import { CaseFile, CaseUrl, DEADLINE_HOURS, Jurisdiction, LedgerEvent, ReportRecord } from './types';

const dir = () => path.join(config.dataDir, 'cases');
const file = (id: string) => path.join(dir(), `${id.replace(/[^A-Za-z0-9_-]/g, '')}.json`);
const now = () => new Date().toISOString();

// ---- ledger -------------------------------------------------------------------------------
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

export function appendEvent(c: CaseFile, type: string, data: unknown): void {
  const prev = c.events[c.events.length - 1];
  const base = { seq: prev ? prev.seq + 1 : 1, at: now(), type, data };
  const prevHash = prev?.hash ?? '0'.repeat(64);
  c.events.push({ ...base, prevHash, hash: sha256(prevHash + stable(base)) });
}

/** Recompute the chain: any edited, removed or reordered event breaks it. */
export function verifyChain(c: CaseFile): { ok: boolean; brokenAtSeq?: number } {
  let prevHash = '0'.repeat(64);
  for (const e of c.events as LedgerEvent[]) {
    const expect = sha256(prevHash + stable({ seq: e.seq, at: e.at, type: e.type, data: e.data }));
    if (e.prevHash !== prevHash || e.hash !== expect) return { ok: false, brokenAtSeq: e.seq };
    prevHash = e.hash;
  }
  return { ok: true };
}

// ---- persistence --------------------------------------------------------------------------
export function saveCase(c: CaseFile) { fs.mkdirSync(dir(), { recursive: true }); fs.writeFileSync(file(c.id), JSON.stringify(c, null, 2)); }
export function loadCase(id: string): CaseFile {
  if (!fs.existsSync(file(id))) throw new Error(`No such case: ${id}`);
  return JSON.parse(fs.readFileSync(file(id), 'utf8'));
}
export function listCases(): CaseFile[] {
  return fs.existsSync(dir()) ? fs.readdirSync(dir()).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir(), f), 'utf8'))) : [];
}

// ---- create -------------------------------------------------------------------------------
export async function createCase(image: Buffer, title: string, jurisdiction: Jurisdiction): Promise<CaseFile> {
  const fp = await computeFingerprint(image, { withFace: false, ocr: false });
  const c: CaseFile = {
    schema: 'imageguard.case/1',
    id: `c_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${crypto.randomBytes(3).toString('hex')}`,
    title, jurisdiction, createdAt: now(),
    fingerprint: {
      sha256: fp.sha256, phash: fp.phash, phashFlipped: fp.phashFlipped,
      embedding: f32ToB64(fp.embedding), embeddingFlipped: f32ToB64(fp.embeddingFlipped), embedderName: fp.embedderName,
    },
    hashPackage: await createHashPackage(image),
    urls: [], events: [],
  };
  appendEvent(c, 'case_created', { title, jurisdiction, imageSha256: fp.sha256, pdq: c.hashPackage.hash, note: 'image itself is NOT stored' });
  saveCase(c);
  return c;
}

/** Rebuild a Fingerprint from the stored data (no pixels needed for verification). */
export const toFingerprint = (c: CaseFile): Fingerprint => ({
  sha256: c.fingerprint.sha256, normalizedImage: Buffer.alloc(0), phash: c.fingerprint.phash, phashFlipped: c.fingerprint.phashFlipped,
  embedding: b64ToF32(c.fingerprint.embedding), embeddingFlipped: b64ToF32(c.fingerprint.embeddingFlipped), embedderName: c.fingerprint.embedderName,
});

// ---- URLs ---------------------------------------------------------------------------------
export function addUrl(c: CaseFile, url: string): CaseUrl {
  const existing = c.urls.find((u) => canonicalUrl(u.url) === canonicalUrl(url));
  if (existing) return existing;
  const rec: CaseUrl = { id: `u${c.urls.length + 1}`, url, addedAt: now(), status: 'discovered', reports: [] };
  c.urls.push(rec);
  appendEvent(c, 'url_added', { id: rec.id, url });
  saveCase(c);
  return rec;
}

/** Candidate images on a URL: the images of an HTML page, or the URL itself if it is an image. */
async function candidatesFor(url: string): Promise<{ cands: Candidate[]; http: 'ok' | 'gone' | 'error'; note: string }> {
  try {
    const imgs = await expandPage(url, 12);
    return { cands: imgs.map((i) => ({ pageUrl: url, imageUrl: i, source: 'case_url' })), http: 'ok', note: `${imgs.length} images found on page` };
  } catch (e) {
    const m = (e as Error).message;
    if (/HTTP (404|410)/.test(m)) return { cands: [], http: 'gone', note: m };
    if (/content-type/.test(m)) { // not HTML: maybe a direct image link
      try { await fetchImageBytes(url); return { cands: [{ pageUrl: url, imageUrl: url, source: 'case_url' }], http: 'ok', note: 'direct image URL' }; } catch { /* fallthrough */ }
    }
    return { cands: [], http: 'error', note: m };
  }
}

export async function verifyUrl(c: CaseFile, u: CaseUrl): Promise<CaseUrl> {
  const fp = toFingerprint(c);
  const verifier = new DefaultVerifier();
  const { cands, http, note } = await candidatesFor(u.url);
  const results = (await Promise.all(cands.map((x) => verifier.verify(x, fp).catch(() => null)))).filter((r) => !!r);
  const best = mergeResults(results as NonNullable<(typeof results)[number]>[])[0];
  if (best) {
    u.status = u.reports.length ? 'reported' : 'verified';
    u.verification = { checkedAt: now(), domain: best.domain, matchType: best.matchType, score: best.score, reasons: best.reasons, nsfw: best.nsfw, imageUrl: best.imageUrl };
  } else {
    u.status = http === 'error' ? 'unreachable' : u.status === 'discovered' ? 'rejected' : u.status;
  }
  u.lastCheck = { at: now(), note: best ? `match: ${best.matchType}` : `no matching image (${note})` };
  appendEvent(c, 'url_verified', { id: u.id, url: u.url, result: best ? { matchType: best.matchType, score: best.score, reasons: best.reasons } : null, note });
  saveCase(c);
  return u;
}

/** Re-check tracked URLs: gone (404/410) or image no longer present => "removed"; still matching => unchanged. */
export async function recheck(c: CaseFile): Promise<Array<{ id: string; url: string; before: string; after: string; note: string }>> {
  const fp = toFingerprint(c);
  const verifier = new DefaultVerifier();
  const out = [];
  for (const u of c.urls.filter((x) => ['verified', 'reported', 'unreachable'].includes(x.status))) {
    const before = u.status;
    const { cands, http, note } = await candidatesFor(u.url);
    const results = (await Promise.all(cands.map((x) => verifier.verify(x, fp).catch(() => null)))).filter((r) => !!r);
    if (http === 'gone') { u.status = 'removed'; u.lastCheck = { at: now(), note: `page gone: ${note}` }; }
    else if (http === 'error') { u.status = 'unreachable'; u.lastCheck = { at: now(), note }; }
    else if (!results.length) { u.status = 'removed'; u.lastCheck = { at: now(), note: 'page reachable but the matching image is no longer on it' }; }
    else { u.status = u.reports.length ? 'reported' : 'verified'; u.lastCheck = { at: now(), note: 'still online' }; }
    appendEvent(c, 'url_rechecked', { id: u.id, before, after: u.status, note: u.lastCheck.note });
    out.push({ id: u.id, url: u.url, before, after: u.status, note: u.lastCheck.note });
  }
  saveCase(c);
  return out;
}

// ---- reports ------------------------------------------------------------------------------
export function recordReport(c: CaseFile, u: CaseUrl, channel: string, basis: string[], reference?: string): ReportRecord {
  const hours = DEADLINE_HOURS[c.jurisdiction];
  const submittedAt = now();
  const r: ReportRecord = {
    id: `r${u.reports.length + 1}`, channel, basis, submittedAt, reference,
    deadlineAt: hours ? new Date(Date.now() + hours * 3600_000).toISOString() : undefined,
  };
  u.reports.push(r);
  if (u.status !== 'removed') u.status = 'reported';
  appendEvent(c, 'report_submitted', { urlId: u.id, ...r });
  saveCase(c);
  return r;
}

export function recordResponse(c: CaseFile, u: CaseUrl, outcome: NonNullable<ReportRecord['response']>['outcome'], note?: string) {
  const r = u.reports[u.reports.length - 1];
  if (!r) throw new Error('No report recorded for this URL yet.');
  r.response = { at: now(), outcome, note };
  if (outcome === 'removed') u.status = 'removed';
  if (outcome === 'rejected') u.status = 'verified';
  appendEvent(c, 'report_response', { urlId: u.id, reportId: r.id, outcome, note });
  saveCase(c);
}

export const isOverdue = (r: ReportRecord) => !!r.deadlineAt && !r.response && Date.now() > Date.parse(r.deadlineAt);
