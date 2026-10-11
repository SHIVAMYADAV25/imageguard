// SCRFD face detector (InsightFace det_10g) with 5-point landmarks. This is the detector ArcFace
// was designed to be paired with: landmarks allow ALIGNMENT (see align.ts), which is the main
// accuracy gain over a plain box crop.
//
// Model: models/scrfd.onnx  (det_10g.onnx from the InsightFace buffalo_l pack, extracted by
// scripts/download-models.sh). 9 outputs: [score_8, score_16, score_32, bbox_8.., kps_8..].
// Decoding follows InsightFace's reference implementation:
//   anchor centres on a (H/stride x W/stride) grid, 2 anchors per cell, distances scaled by stride.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';
import { config } from '../config';
import { FaceBox } from '../types';
import { nms } from './boxes';

export const SCRFD_PATH = path.join(config.modelsDir, 'scrfd.onnx');
export const scrfdAvailable = () => fs.existsSync(SCRFD_PATH);

const SIZE = 640;
const STRIDES = [8, 16, 32];
const NUM_ANCHORS = 2;

let session: Promise<ort.InferenceSession> | null = null;

export interface RawDet { x1: number; y1: number; x2: number; y2: number; score: number; kps: number[] }

/** Decode one feature level. Pure function (unit-tested without the model). */
export function decodeStride(scores: ArrayLike<number>, bbox: ArrayLike<number>, kps: ArrayLike<number>, stride: number, inW: number, inH: number, thresh: number): RawDet[] {
  const gw = inW / stride, gh = inH / stride;
  const out: RawDet[] = [];
  let i = 0;
  for (let r = 0; r < gh; r++)
    for (let c = 0; c < gw; c++)
      for (let a = 0; a < NUM_ANCHORS; a++, i++) { // anchors of one cell are adjacent in the output
        const s = scores[i];
        if (s < thresh) continue;
        const cx = c * stride, cy = r * stride;
        out.push({
          x1: cx - bbox[i * 4] * stride, y1: cy - bbox[i * 4 + 1] * stride,
          x2: cx + bbox[i * 4 + 2] * stride, y2: cy + bbox[i * 4 + 3] * stride,
          score: s,
          kps: Array.from({ length: 10 }, (_, k) => (k % 2 === 0 ? cx : cy) + kps[i * 10 + k] * stride),
        });
      }
  return out;
}

export async function detectScrfd(img: Buffer, thresh = 0.5): Promise<FaceBox[]> {
  const { width: W = 0, height: H = 0 } = await sharp(img, { failOn: 'none' }).metadata();
  if (!W || !H) return [];

  // Keep aspect ratio, paste at the top-left of a 640x640 canvas (InsightFace does the same).
  const scale = Math.min(SIZE / W, SIZE / H);
  const nw = Math.max(1, Math.round(W * scale)), nh = Math.max(1, Math.round(H * scale));
  const { data } = await sharp(img, { failOn: 'none' }).removeAlpha().resize(nw, nh, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const input = new Float32Array(3 * SIZE * SIZE).fill((0 - 127.5) / 128); // padding = black
  for (let y = 0; y < nh; y++)
    for (let x = 0; x < nw; x++)
      for (let c = 0; c < 3; c++) input[c * SIZE * SIZE + y * SIZE + x] = (data[(y * nw + x) * 3 + c] - 127.5) / 128; // RGB

  session ??= ort.InferenceSession.create(SCRFD_PATH, { logSeverityLevel: 3 });
  const s = await session;
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });
  const t = s.outputNames.map((n) => out[n].data as Float32Array);
  if (t.length !== 9) throw new Error(`scrfd.onnx has ${t.length} outputs; expected 9 (det_10g with keypoints)`);

  const dets: FaceBox[] = [];
  STRIDES.forEach((stride, k) => {
    for (const d of decodeStride(t[k], t[k + 3], t[k + 6], stride, SIZE, SIZE, thresh)) {
      const x1 = Math.max(0, d.x1 / scale), y1 = Math.max(0, d.y1 / scale);
      const x2 = Math.min(W, d.x2 / scale), y2 = Math.min(H, d.y2 / scale);
      dets.push({
        x: x1, y: y1, w: x2 - x1, h: y2 - y1, score: d.score,
        kps: [0, 2, 4, 6, 8].map((j) => [d.kps[j] / scale, d.kps[j + 1] / scale]),
      });
    }
  });
  return nms(dets, 0.4).filter((b) => b.w >= 24 && b.h >= 24);
}
