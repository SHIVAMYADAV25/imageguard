// Face detection + face embeddings. Only used AFTER the ownership gate passes.
//   Detector (best available): SCRFD det_10g  -> models/scrfd.onnx          (boxes + 5 landmarks)
//                    fallback: UltraFace RFB-640 -> models/face_detector.onnx (boxes only)
//   Embedder: InsightFace ArcFace w600k_r50 (512-d) -> models/arcface.onnx
// With SCRFD landmarks the face is ALIGNED (align.ts) before ArcFace; with UltraFace it is a plain
// square crop (lower accuracy).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';
import { config } from '../config';
import { FaceBox } from '../types';
import { l2normalize } from '../util/math';
import { nms } from './boxes';
import { detectScrfd, scrfdAvailable } from './scrfd';
import { alignForArcface } from './align';

const DET = path.join(config.modelsDir, 'face_detector.onnx');
const ARC = path.join(config.modelsDir, 'arcface.onnx');

export const faceModelsAvailable = () => (scrfdAvailable() || fs.existsSync(DET)) && fs.existsSync(ARC);
export const detectorName = () => (scrfdAvailable() ? 'scrfd+landmarks+alignment' : 'ultraface (no alignment)');

let detSession: Promise<ort.InferenceSession> | null = null;
let arcSession: Promise<ort.InferenceSession> | null = null;
const ultraface = () => (detSession ??= ort.InferenceSession.create(DET, { logSeverityLevel: 3 }));
const arcface = () => (arcSession ??= ort.InferenceSession.create(ARC, { logSeverityLevel: 3 }));

async function detectUltraface(img: Buffer, minScore: number): Promise<FaceBox[]> {
  if (!fs.existsSync(DET)) return [];
  const { width: W = 0, height: H = 0 } = await sharp(img, { failOn: 'none' }).metadata();
  if (!W || !H) return [];
  const { data } = await sharp(img, { failOn: 'none' }).removeAlpha().resize(640, 480, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const px = 640 * 480;
  const input = new Float32Array(3 * px);
  for (let i = 0; i < px; i++) for (let c = 0; c < 3; c++) input[c * px + i] = (data[i * 3 + c] - 127) / 128;
  const s = await ultraface();
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, 480, 640]) });
  const scores = (out['scores'] ?? out[s.outputNames[0]]).data as Float32Array;
  const boxes = (out['boxes'] ?? out[s.outputNames[1]]).data as Float32Array;
  const found: FaceBox[] = [];
  for (let i = 0; i < scores.length / 2; i++) {
    const sc = scores[i * 2 + 1];
    if (sc < minScore) continue;
    const x1 = Math.max(0, boxes[i * 4]) * W, y1 = Math.max(0, boxes[i * 4 + 1]) * H;
    const x2 = Math.min(1, boxes[i * 4 + 2]) * W, y2 = Math.min(1, boxes[i * 4 + 3]) * H;
    found.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, score: sc });
  }
  return nms(found, 0.3).filter((b) => b.w >= 24 && b.h >= 24);
}

export async function detectFaces(img: Buffer, minScore = 0.7): Promise<FaceBox[]> {
  return scrfdAvailable() ? detectScrfd(img, Math.min(minScore, 0.5)) : detectUltraface(img, minScore);
}

export async function detectLargestFace(img: Buffer): Promise<FaceBox | null> {
  const faces = await detectFaces(img);
  return faces.length ? faces.sort((a, b) => b.w * b.h - a.w * a.h)[0] : null;
}

/** 512-d ArcFace embedding (L2-normalized, so dot product = cosine). Aligned when landmarks exist. */
export async function faceEmbedding(img: Buffer, box: FaceBox): Promise<Float32Array> {
  const { data, info } = await sharp(img, { failOn: 'none' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let input: Float32Array;

  if (box.kps && box.kps.length === 5) {
    input = alignForArcface(data, W, H, box.kps);
  } else {
    // Fallback: square crop with 15% margin (no rotation correction).
    const side = Math.max(box.w, box.h) * 1.15;
    let left = Math.max(0, Math.round(box.x + box.w / 2 - side / 2));
    let top = Math.max(0, Math.round(box.y + box.h / 2 - side / 2));
    const size = Math.max(8, Math.min(Math.round(side), W - left, H - top));
    left = Math.min(left, W - size); top = Math.min(top, H - size);
    const crop = await sharp(img, { failOn: 'none' }).extract({ left, top, width: size, height: size }).removeAlpha().resize(112, 112, { fit: 'fill' }).raw().toBuffer();
    const px = 112 * 112;
    input = new Float32Array(3 * px);
    for (let i = 0; i < px; i++) for (let c = 0; c < 3; c++) input[c * px + i] = (crop[i * 3 + c] - 127.5) / 127.5;
  }
  const s = await arcface();
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, 112, 112]) });
  return l2normalize(Float32Array.from(out[s.outputNames[0]].data as Float32Array));
}
