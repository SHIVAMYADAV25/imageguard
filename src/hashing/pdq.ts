// On-device perceptual hashing for intimate-image protection. A PDQ-STYLE 256-bit hash:
//   luma -> 512x512 -> 64x64 box average -> 2-D DCT -> take the 16x16 low-frequency block
//   (skipping the DC row/column) -> threshold at the median -> 256 bits.
// StopNCII uses Meta's PDQ (or PhotoDNA) for photos, which follows the same recipe.
//
// IMPORTANT HONESTY: this is a clean re-implementation of the PDQ *recipe*, not Meta's reference
// code, so hashes are NOT guaranteed bit-identical to StopNCII's and CANNOT be submitted to it.
// To protect a real intimate image, the person must create the hash on stopncii.org (it runs
// in their browser; the image never leaves the device). Our hash is used for (a) our own case
// matching and (b) the platform-side moderation simulator. For interop, swap in Meta's
// open-source reference implementation (ThreatExchange/pdq).
//
// Dihedral: we hash all 8 rotations/flips so rotated or mirrored re-uploads still match.
import sharp from 'sharp';
import { hamming, median } from '../util/math';

const N = 64;   // working grid
const K = 16;   // DCT block => 16*16 = 256 bits
export const PDQ_MATCH_THRESHOLD = 31; // Hamming distance (of 256) at/below which Meta suggests treating images as matching
export const PDQ_MIN_QUALITY = 50;     // below this the hash is unreliable (flat / blank / tiny images)

const COS: Float64Array[] = Array.from({ length: N }, (_, k) =>
  Float64Array.from({ length: N }, (_, n) => Math.cos(((2 * n + 1) * k * Math.PI) / (2 * N))),
);

/** 64x64 luma grid (BT.601 weights) from a 512x512 lanczos resize, box-averaged 8x8. */
async function lumaGrid(img: Buffer): Promise<Float64Array> {
  const { data } = await sharp(img, { failOn: 'none', limitInputPixels: 60_000_000 })
    .rotate()
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .resize(512, 512, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const g = new Float64Array(N * N);
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 3;
      g[((y >> 3) * N) + (x >> 3)] += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 64;
    }
  return g;
}

const rotate90 = (g: Float64Array) => { const o = new Float64Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) o[y * N + x] = g[(N - 1 - x) * N + y]; return o; };
const flipH = (g: Float64Array) => { const o = new Float64Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) o[y * N + x] = g[y * N + (N - 1 - x)]; return o; };

/** Only the 16x16 coefficients we need (rows/cols 1..16): ~80k multiplies instead of 500k. */
function hashGrid(g: Float64Array): string {
  const tmp = new Float64Array(N * K); // tmp[y][u]
  for (let y = 0; y < N; y++)
    for (let u = 0; u < K; u++) {
      let s = 0;
      for (let x = 0; x < N; x++) s += g[y * N + x] * COS[u + 1][x];
      tmp[y * K + u] = s;
    }
  const vals: number[] = [];
  for (let v = 0; v < K; v++)
    for (let u = 0; u < K; u++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += tmp[y * K + u] * COS[v + 1][y];
      vals.push(s);
    }
  const med = median(vals);
  let bits = 0n;
  for (const v of vals) bits = (bits << 1n) | (v > med ? 1n : 0n);
  return bits.toString(16).padStart(64, '0');
}

/** PDQ's "image domain quality": how much gradient (detail) the image has, 0..100. */
function quality(g: Float64Array): number {
  let sum = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (x < N - 1) sum += Math.floor((Math.abs(g[y * N + x] - g[y * N + x + 1]) * 100) / 255);
      if (y < N - 1) sum += Math.floor((Math.abs(g[y * N + x] - g[(y + 1) * N + x]) * 100) / 255);
    }
  return Math.min(Math.floor(sum / 90), 100);
}

export interface PdqResult { hash: string; dihedral: string[]; quality: number }

export async function pdq(img: Buffer): Promise<PdqResult> {
  const g = await lumaGrid(img);
  const dihedral: string[] = [];
  let r = g;
  for (let i = 0; i < 4; i++) { dihedral.push(hashGrid(r), hashGrid(flipH(r))); r = rotate90(r); }
  return { hash: dihedral[0], dihedral, quality: quality(g) };
}

/** Distance between two images = min over the 8 orientations of one against the other's base hash. */
export const pdqDistance = (baseHash: string, otherDihedral: string[]) =>
  Math.min(...otherDihedral.map((h) => hamming(baseHash, h)));

/** The ONLY thing that ever needs to leave the user's device: no pixels, no thumbnail. */
export interface HashPackage {
  schema: 'imageguard.hashpkg/1';
  algo: 'pdq-style-256';
  createdAt: string;
  quality: number;
  hash: string;
  note: string;
}
export async function createHashPackage(img: Buffer): Promise<HashPackage> {
  const r = await pdq(img);
  return {
    schema: 'imageguard.hashpkg/1',
    algo: 'pdq-style-256',
    createdAt: new Date().toISOString(),
    quality: r.quality,
    hash: r.hash,
    note: 'Not bit-compatible with StopNCII. To protect a real image create the hash on stopncii.org.',
  };
}
