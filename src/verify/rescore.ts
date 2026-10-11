// Stage 4a: "do not trust the provider, recompute similarity yourself".
// Split in two so expensive work happens once per candidate and comparisons are cheap:
//   analyzeCandidate(bytes)      -> CandidateFeatures   (decode, pHash, embedding, optional face)
//   compareFeatures(fp, feats)   -> Signals             (just arithmetic; the eval harness reuses it)
import { Fingerprint, Signals, FaceBox } from '../types';
import { normalize } from '../util/image';
import { cosine, hamming } from '../util/math';
import { phash } from '../fingerprint/phash';
import { getEmbedder } from '../fingerprint/embed';
import { detectLargestFace, faceEmbedding } from '../fingerprint/face';
import { maskFace } from '../fingerprint/mask';

export interface CandidateFeatures {
  normalized: Buffer;
  phash: string;
  embedding: Float32Array;
  face?: { box: FaceBox; embedding: Float32Array };
  maskedEmbedding?: Float32Array;
}

/** @param withFace only true when the query has a verified face (Step 6) */
export async function analyzeCandidate(raw: Buffer, withFace: boolean): Promise<CandidateFeatures> {
  const normalized = await normalize(raw);
  const embedder = await getEmbedder();
  const [ph, embedding] = await Promise.all([phash(normalized), embedder.embed(normalized)]);
  const feats: CandidateFeatures = { normalized, phash: ph, embedding };

  if (withFace) {
    const box = await detectLargestFace(normalized);
    if (box) {
      feats.face = { box, embedding: await faceEmbedding(normalized, box) };
      // Mask THE CANDIDATE'S face (wherever it is) and embed the rest: body/pose/background.
      feats.maskedEmbedding = await embedder.embed(await maskFace(normalized, box));
    }
  }
  return feats;
}

export function compareFeatures(fp: Fingerprint, cf: CandidateFeatures): Signals {
  // A mirrored re-upload defeats pHash, so we compare against both orientations and keep the closer.
  const dNormal = hamming(fp.phash, cf.phash);
  const dFlipped = hamming(fp.phashFlipped, cf.phash);
  const phashDistance = Math.min(dNormal, dFlipped);

  const signals: Signals = {
    phashDistance,
    phash: 1 - phashDistance / 64,
    mirrored: dFlipped < dNormal,
    // Same idea for the embedding: take whichever orientation of the query is closer.
    embedding: Math.max(cosine(fp.embedding, cf.embedding), cosine(fp.embeddingFlipped, cf.embedding)),
  };
  if (fp.faceEmbedding && cf.face) signals.face = cosine(fp.faceEmbedding, cf.face.embedding);
  if (fp.maskedEmbedding && cf.maskedEmbedding) signals.bodyOrBg = cosine(fp.maskedEmbedding, cf.maskedEmbedding);
  return signals;
}
