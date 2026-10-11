// Stage 2 orchestrator: turn the upload into a Fingerprint (all signals computed once).
import sharp from 'sharp';
import { Fingerprint } from '../types';
import { normalize } from '../util/image';
import { sha256 } from '../util/math';
import { getEmbedder } from './embed';
import { phash } from './phash';
import { runOcr } from './ocr';
import { detectLargestFace, faceModelsAvailable, faceEmbedding } from './face';
import { maskFace } from './mask';
import { log } from '../util/log';

export interface FingerprintOptions {
  /** Compute face + masked-region signals. Only ever true after the ownership gate passed. */
  withFace: boolean;
  ocr?: boolean;
}

export async function computeFingerprint(raw: Buffer, opts: FingerprintOptions): Promise<Fingerprint> {
  const norm = await normalize(raw);
  const embedder = await getEmbedder();

  // Independent signals -> compute in parallel.
  const mirrored = await sharp(norm).flop().jpeg({ quality: 92 }).toBuffer();
  const [ph, phFlip, emb, embFlip] = await Promise.all([phash(norm), phash(norm, true), embedder.embed(norm), embedder.embed(mirrored)]);

  const fp: Fingerprint = {
    sha256: sha256(raw),
    normalizedImage: norm,
    phash: ph,
    phashFlipped: phFlip,
    embedding: emb,
    embeddingFlipped: embFlip,
    embedderName: embedder.name,
  };

  // OCR gets a larger render (2000px) than the 1024px used for hashing: small text needs pixels.
  if (opts.ocr) fp.ocrText = await runOcr(await normalize(raw, 2000));

  // --- Step 6: region-level signals for deepfake logic --------------------------------------
  if (opts.withFace) {
    if (!faceModelsAvailable()) {
      log.warn('fingerprint', 'face models missing: deepfake region analysis disabled (npm run models)');
    } else {
      const box = await detectLargestFace(norm);
      if (!box) {
        log.warn('fingerprint', 'no face found in the upload: deepfake region analysis disabled');
      } else {
        fp.faceBox = box;
        fp.faceEmbedding = await faceEmbedding(norm, box);
        // Paint the face gray and embed what is left (body + background + pose).
        fp.maskedEmbedding = await embedder.embed(await maskFace(norm, box));
      }
    }
  }
  return fp;
}
