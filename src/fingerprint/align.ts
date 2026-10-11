// Face ALIGNMENT for ArcFace. ArcFace models are trained on faces warped so that the eyes, nose
// and mouth corners land on fixed positions in a 112x112 image. Feeding an unaligned crop (what a
// box-only detector gives) costs accuracy; rotation and scale differences become "identity" noise.
//
// We estimate the least-squares SIMILARITY transform (rotation + uniform scale + translation)
// from the 5 detected landmarks to the standard ArcFace template, then warp with bilinear sampling.

export const ARCFACE_TEMPLATE: number[][] = [
  [38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041],
];

export interface Similarity { a: number; b: number; tx: number; ty: number } // u = a*x - b*y + tx ; v = b*x + a*y + ty

/** Closed-form 2-D Umeyama: treat points as complex numbers, solve w = c*z + t with c = a+ib. */
export function estimateSimilarity(src: number[][], dst: number[][]): Similarity {
  const n = src.length;
  const mx = src.reduce((s, p) => s + p[0], 0) / n, my = src.reduce((s, p) => s + p[1], 0) / n;
  const mu = dst.reduce((s, p) => s + p[0], 0) / n, mv = dst.reduce((s, p) => s + p[1], 0) / n;
  let num1 = 0, num2 = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const x = src[i][0] - mx, y = src[i][1] - my, u = dst[i][0] - mu, v = dst[i][1] - mv;
    num1 += x * u + y * v;
    num2 += x * v - y * u;
    den += x * x + y * y;
  }
  const a = num1 / (den || 1), b = num2 / (den || 1);
  return { a, b, tx: mu - (a * mx - b * my), ty: mv - (b * mx + a * my) };
}

/**
 * Warp the face to 112x112 and return the ArcFace input tensor data (CHW, (v-127.5)/127.5).
 * @param rgb raw interleaved RGB pixels of the whole image, @param kps 5 landmarks in image pixels
 */
export function alignForArcface(rgb: Uint8Array, w: number, h: number, kps: number[][]): Float32Array {
  const { a, b, tx, ty } = estimateSimilarity(kps, ARCFACE_TEMPLATE);
  const det = a * a + b * b || 1;
  const S = 112;
  const out = new Float32Array(3 * S * S);
  const px = (x: number, y: number, c: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : rgb[(y * w + x) * 3 + c]);
  for (let v = 0; v < S; v++)
    for (let u = 0; u < S; u++) {
      // inverse map: output pixel (u,v) -> source position (x,y)
      const x = (a * (u - tx) + b * (v - ty)) / det;
      const y = (-b * (u - tx) + a * (v - ty)) / det;
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      for (let c = 0; c < 3; c++) {
        const val =
          px(x0, y0, c) * (1 - fx) * (1 - fy) + px(x0 + 1, y0, c) * fx * (1 - fy) +
          px(x0, y0 + 1, c) * (1 - fx) * fy + px(x0 + 1, y0 + 1, c) * fx * fy;
        out[c * S * S + v * S + u] = (val - 127.5) / 127.5;
      }
    }
  return out;
}
