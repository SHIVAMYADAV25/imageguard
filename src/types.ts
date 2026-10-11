// Shared types for the whole engine. Read this file first: it is the contract between stages.

export type MatchType = 'exact' | 'near_duplicate' | 'similar' | 'possible_deepfake';
export type NsfwLabel = 'safe' | 'suggestive' | 'explicit' | 'unknown';

/** What the user attests to at intake (Stage 1). */
export interface Declaration {
  isOwnerOrAuthorized: boolean; // "this image shows me, or I am legally authorised to act for the person"
  isAdult: boolean;             // "the person shown is 18+"
}

export interface SearchQuery {
  imageBuffer: Buffer;
  selfieBuffer?: Buffer;   // optional: unlocks face features after a same-person check (Step 6)
  imageUrl?: string;       // optional: if the image is already public, skips temp hosting
  keywords: string[];
  usernames: string[];
  knownUrls: string[];
  declaration: Declaration;
}

export interface FaceBox {
  x: number; y: number; w: number; h: number; score: number;
  kps?: number[][]; // 5 landmarks [x,y]: left eye, right eye, nose, left mouth corner, right mouth corner (SCRFD only)
}

/** Everything we compute ONCE about the query image (Stage 2). */
export interface Fingerprint {
  sha256: string;               // of the raw upload (exact byte match)
  normalizedImage: Buffer;      // the normalized JPEG all other signals are derived from
  phash: string;                // 64-bit DCT hash, hex
  phashFlipped: string;         // same hash of the mirrored image (catches mirrored copies)
  embedding: Float32Array;      // global semantic embedding (L2-normalized)
  embeddingFlipped: Float32Array; // embedding of the mirrored image (so mirrored re-uploads still match)
  embedderName: string;         // which model produced `embedding` (vectors of different models are not comparable)
  faceBox?: FaceBox;            // Step 6 (only if ownership verified)
  faceEmbedding?: Float32Array; // Step 6
  maskedEmbedding?: Float32Array; // Step 6: embedding of the image with the face painted gray
  ocrText?: string;
}

/** A possible match returned by a discovery connector (Stage 3), not yet verified. */
export interface Candidate {
  pageUrl: string;          // the web page it was found on
  imageUrl?: string;        // direct image URL (full size, if the provider gave it)
  thumbnailUrl?: string;    // provider thumbnail (fallback for verification)
  inlineImage?: Buffer;     // test/eval only: bytes already in memory, skips the network
  source: string;           // connector name
  providerScore?: number;   // provider's own confidence (we do NOT trust it)
  title?: string;
}

/** The individual numbers behind a verdict (Stage 4). */
export interface Signals {
  phashDistance: number;  // 0..64 (lower = more similar), min of normal/mirrored
  phash: number;          // 1 - distance/64
  mirrored: boolean;      // true if the mirrored hash was the closer one
  embedding: number;      // cosine of global embeddings
  face?: number;          // cosine of face embeddings (verified owner only)
  bodyOrBg?: number;      // cosine of face-masked embeddings (verified owner only)
  artifact?: number;      // 0..1 deepfake-artifact probability (weak signal, optional model)
}

export interface MatchResult {
  id: string;
  pageUrl: string;
  imageUrl?: string;
  thumbnailBlobId?: string;  // id of a stored thumbnail (pixelated unless clearly safe)
  domain: string;
  matchType: MatchType;
  score: number;             // 0..1 combined, for ranking
  reasons: string[];         // human-readable explanation of why this label was chosen
  signals: Signals;
  nsfw: NsfwLabel;
  foundBy: string[];         // every connector that surfaced it
  report?: { name: string; reportUrl?: string; notes?: string }; // from the domain registry
}

export interface Verifier {
  verify(c: Candidate, fp: Fingerprint): Promise<MatchResult | null>;
}
