// Perceptual hash (pHash): a 64-bit fingerprint that survives resizing, recompression,
// colour changes and mild edits. Two images are "the same picture" if the Hamming distance
// between their hashes is small.
//
// Algorithm (the classic one):
//   1. shrink to 32x32 grayscale  -> removes detail, keeps structure
//   2. 2-D DCT                    -> converts to frequency space
//   3. keep the top-left 8x8      -> the LOW frequencies = the overall structure of the image
//   4. compare each coefficient to the median -> 64 bits
import sharp from 'sharp';
import { median } from '../util/math';

const N = 32; // working resolution
const K = 8;  // low-frequency block size => K*K = 64 bits

// Pre-computed cosine table: COS[k][n] = cos((2n+1) k pi / 2N)
const COS: number[][] = Array.from({ length: N }, (_, k) =>
  Array.from({ length: N }, (_, n) => Math.cos(((2 * n + 1) * k * Math.PI) / (2 * N))),
);

/** Separable 2-D DCT-II (rows then columns). O(N^3) = ~65k multiplies: trivial for 32x32. */
function dct2d(px: Float64Array): Float64Array {
  const tmp = new Float64Array(N * N);
  for (let y = 0; y < N; y++)
    for (let k = 0; k < N; k++) {
      let s = 0;
      for (let n = 0; n < N; n++) s += px[y * N + n] * COS[k][n];
      tmp[y * N + k] = s;
    }
  const out = new Float64Array(N * N);
  for (let x = 0; x < N; x++)
    for (let k = 0; k < N; k++) {
      let s = 0;
      for (let n = 0; n < N; n++) s += tmp[n * N + x] * COS[k][n];
      out[k * N + x] = s;
    }
  return out;
}

/** @param flip hash the horizontally mirrored image instead (used to catch mirrored copies) */
export async function phash(img: Buffer, flip = false): Promise<string> {
  let pipe = sharp(img, { failOn: 'none' }).rotate();
  if (flip) pipe = pipe.flop();
  const { data, info } = await pipe
    .greyscale()
    .resize(N, N, { fit: 'fill' }) // 'fill' ignores aspect ratio on purpose: the hash is of structure
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) px[i] = data[i * info.channels];

  const dct = dct2d(px);
  const low: number[] = [];
  for (let v = 0; v < K; v++) for (let u = 0; u < K; u++) low.push(dct[v * N + u]);

  // Median of the 63 AC terms (skip the DC term low[0], which encodes mean brightness and is huge).
  const med = median(low.slice(1));
  let bits = 0n;
  for (const c of low) bits = (bits << 1n) | (c > med ? 1n : 0n);
  return bits.toString(16).padStart(16, '0');
}
