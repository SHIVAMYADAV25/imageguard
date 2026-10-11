// Stage 4c: turn Signals into a label + a 0..1 score + human-readable reasons.
// Rules are evaluated in priority order. Every threshold is in config.ts / embed.ts so that the
// eval harness can be used to calibrate them.
import { MatchType, Signals } from '../types';
import { EmbedderCalibration } from '../fingerprint/embed';
import { config } from '../config';
import { clamp } from '../util/math';

export interface Verdict { matchType: MatchType | null; score: number; reasons: string[] }

export function classify(s: Signals, calib: EmbedderCalibration, sameBytes = false): Verdict {
  const t = config.thresholds;
  const reasons: string[] = [];

  // Ranking score: strong evidence from EITHER pHash or embedding is enough (a crop kills pHash
  // but not the embedding), so we weight the better one more than the worse one.
  const pNorm = clamp((s.phash - 0.6) / 0.4);       // distance 0 -> 1.0, distance ~26 -> 0
  const eNorm = clamp((s.embedding - 0.6) / 0.4);   // cosine 1.0 -> 1.0, 0.6 -> 0
  let score = 0.65 * Math.max(pNorm, eNorm) + 0.35 * Math.min(pNorm, eNorm);

  const base = `pHash distance ${s.phashDistance}/64${s.mirrored ? ' (mirrored)' : ''}, embedding cosine ${s.embedding.toFixed(3)}`;

  // ---- 1. Deepfake logic (needs verified owner: face + masked signals exist only then) ------
  if (s.face !== undefined && s.bodyOrBg !== undefined) {
    // (a) FACE REPLACED: your body/scene/pose is there, but the face is not yours.
    if (s.bodyOrBg >= calib.sameScene && s.face <= t.faceDifferent) {
      reasons.push(`body/background matches yours (${s.bodyOrBg.toFixed(2)}) but the face does not (${s.face.toFixed(2)}): possible face swap onto your photo`, base);
      return { matchType: 'possible_deepfake', score: clamp(Math.max(score, 0.6) + 0.1 * (s.artifact ?? 0)), reasons };
    }
    // (b) YOUR FACE ELSEWHERE: face matches but scene is different. This is also what ANY other
    //     genuine photo of you looks like, so we only report it when an artifact detector adds
    //     evidence of synthesis. Without that evidence it is deliberately NOT reported.
    if (s.face >= t.faceSame && s.bodyOrBg < calib.similar && s.embedding < calib.similar) {
      if ((s.artifact ?? 0) >= t.artifactMin) {
        reasons.push(`your face (${s.face.toFixed(2)}) in a different scene, with synthetic-artifact evidence (${(s.artifact ?? 0).toFixed(2)}): possible face transplant`, base);
        return { matchType: 'possible_deepfake', score: clamp(0.5 + 0.4 * (s.artifact ?? 0)), reasons };
      }
      return { matchType: null, score, reasons: ['face-only match without synthetic-artifact evidence: not reported'] };
    }
  }

  // ---- 2. Exact: same bytes, or visually identical (re-encode / resize / tiny edits) --------
  if (sameBytes) return { matchType: 'exact', score: 1, reasons: ['byte-identical to the upload'] };
  // A mirrored copy is by definition an EDIT, so it can never be labelled "exact".
  if (!s.mirrored && s.phashDistance <= t.phashExactMax && s.embedding >= calib.exact) {
    reasons.push('same picture (re-encoded / resized)', base);
    return { matchType: 'exact', score, reasons };
  }

  // ---- 3. Near-duplicate: the same picture, edited (crop, filter, mirror, overlay) ----------
  if ((s.phashDistance <= t.phashNearMax && s.embedding >= calib.similar - 0.1) || s.embedding >= calib.nearDup) {
    reasons.push('same picture with edits (crop / filter / mirror / overlay)', base);
    return { matchType: 'near_duplicate', score, reasons };
  }

  // ---- 4. Similar: same scene / subject, different pixels ----------------------------------
  if (s.embedding >= calib.similar) {
    reasons.push('visually similar (same subject or scene)', base);
    return { matchType: 'similar', score, reasons };
  }

  return { matchType: null, score, reasons: [base] };
}
