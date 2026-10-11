// Stage 4 orchestrator for ONE candidate:
//   get bytes -> analyze -> compare -> (artifact score) -> classify -> NSFW label -> thumbnail -> result
import { Candidate, Fingerprint, MatchResult, Verifier } from '../types';
import { config } from '../config';
import { sha256, domainOf } from '../util/math';
import { pixelatedThumb, plainThumb } from '../util/image';
import { getEmbedder } from '../fingerprint/embed';
import { classify } from '../rank/score';
import { lookupReport } from '../registry/registry';
import { log } from '../util/log';
import { fetchImageBytes } from './fetcher';
import { analyzeCandidate, compareFeatures } from './rescore';
import { classifyNsfw } from './nsfw';
import { artifactScore } from './deepfake';
import { saveBlob } from './blobs';

export class DefaultVerifier implements Verifier {
  async verify(c: Candidate, fp: Fingerprint): Promise<MatchResult | null> {
    // 1) Get the pixels: in-memory (tests) > full image URL > provider thumbnail.
    const raw = await this.getBytes(c);
    if (!raw) return null;

    // 2) Decode + fingerprint the candidate. A broken/odd file simply is not a match.
    const withFace = !!fp.faceEmbedding; // face analysis only if the QUERY has a verified face
    let feats;
    try {
      feats = await analyzeCandidate(raw, withFace);
    } catch (e) {
      log.debug('verify', `undecodable candidate ${c.pageUrl}: ${(e as Error).message}`);
      return null;
    }

    // 3) Real similarity, computed by us.
    const signals = compareFeatures(fp, feats);

    // 4) Optional artifact score, only worth computing when the face matches (it feeds rule (b)).
    if (signals.face !== undefined && signals.face >= config.thresholds.faceSame) {
      const a = await artifactScore(feats.normalized);
      if (a !== null) signals.artifact = a;
    }

    // 5) Label + score.
    const embedder = await getEmbedder();
    const verdict = classify(signals, embedder.calib, sha256(raw) === fp.sha256);
    if (!verdict.matchType) return null;

    // 6) NSFW label drives thumbnail handling: only clearly-safe images keep a readable thumbnail.
    const nsfw = await classifyNsfw(feats.normalized);
    const thumb = nsfw === 'safe' ? await plainThumb(feats.normalized) : await pixelatedThumb(feats.normalized);

    const domain = domainOf(c.pageUrl);
    return {
      id: sha256(c.pageUrl + '|' + (c.imageUrl ?? '')).slice(0, 12),
      pageUrl: c.pageUrl,
      imageUrl: c.imageUrl,
      thumbnailBlobId: saveBlob(thumb),
      domain,
      matchType: verdict.matchType,
      score: Number(verdict.score.toFixed(3)),
      reasons: verdict.reasons,
      signals,
      nsfw,
      foundBy: (c as Candidate & { sources?: string[] }).sources ?? [c.source],
      report: lookupReport(domain),
    };
  }

  private async getBytes(c: Candidate): Promise<Buffer | null> {
    if (c.inlineImage) return c.inlineImage;
    for (const url of [c.imageUrl, c.thumbnailUrl]) {
      if (!url) continue;
      try {
        return await fetchImageBytes(url);
      } catch (e) {
        log.debug('verify', `fetch failed ${url}: ${(e as Error).message}`);
      }
    }
    return null;
  }
}
