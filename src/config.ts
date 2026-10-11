// Central configuration. Every tunable number lives here so the eval harness
// (src/eval/harness.ts) can be used to calibrate them in ONE place.
import 'dotenv/config';
import path from 'node:path';

const num = (v: string | undefined, d: number) =>
  v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d;

const root = path.resolve(__dirname, '..');

export const config = {
  root,
  dataDir: path.resolve(root, process.env.DATA_DIR ?? 'data'),
  modelsDir: path.resolve(root, process.env.MODELS_DIR ?? 'models'),

  keys: {
    serpApi: process.env.SERPAPI_KEY ?? '',
    tineye: process.env.TINEYE_API_KEY ?? '',
  },

  // Temp image host (see src/hosting/tempHost.ts)
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, ''),
  hostPort: num(process.env.HOST_PORT, 8787),

  userAgent:
    process.env.USER_AGENT ?? 'ImageGuardBot/0.1 (+https://example.com/bot; research prototype)',
  enableOcr: process.env.ENABLE_OCR !== '0', // PaddleOCR (ONNX) runs by default; set ENABLE_OCR=0 to skip

  limits: {
    uploadBytes: 10 * 1024 * 1024,        // max size of the user's upload
    candidateImageBytes: 5 * 1024 * 1024, // max size of any image we download from the web
    htmlBytes: 2 * 1024 * 1024,           // max size of an HTML page we download
    connectorTimeoutMs: 30_000,           // each discovery connector must answer within this
    fetchTimeoutMs: 10_000,               // each outbound fetch of a candidate
    verifyConcurrency: 6,                 // parallel candidate verifications
    maxCandidates: 150,                   // hard cap after merge (cost control)
    maxPageExpansions: 20,                // how many page-only candidates we open to find images
    imagesPerExpandedPage: 6,
    maxTextQueries: 6,                    // SERP queries generated from usernames/keywords
  },

  // Thresholds that are NOT embedder specific. Embedder-specific ones live in embed.ts.
  thresholds: {
    phashExactMax: 3,     // Hamming distance (of 64 bits) for "same picture"
    phashNearMax: 12,     // Hamming distance for "same picture, edited"
    faceSame: 0.35,       // ArcFace cosine >= this  => same person
    faceDifferent: 0.2,   // ArcFace cosine <= this  => different person
    ownerFaceMatch: 0.4,  // selfie-vs-upload cosine needed to unlock face features
    artifactMin: 0.5,     // deepfake-artifact detector probability needed for face-only evidence
    nsfwExplicit: 0.45,   // NudeNet class score for "exposed" classes
    nsfwSuggestive: 0.5,
  },
} as const;
