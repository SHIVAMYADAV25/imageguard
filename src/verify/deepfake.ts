// Step 7b: OPTIONAL synthetic-image artifact detector. Treat its output as a WEAK signal:
// no public detector is reliable across generators, compression and platforms.
// The engine's main deepfake logic is the REGION comparison (rank/score.ts); this only adds evidence.
//
// BYO model: drop any ONNX binary classifier at models/deepfake_detector.onnx.
// Assumed contract (adapt below if yours differs): input [1,3,224,224] ImageNet-normalized RGB;
// output either one logit (P(fake)=sigmoid) or two logits [real, fake] (softmax, index 1 = fake).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';
import { config } from '../config';

const MODEL = path.join(config.modelsDir, 'deepfake_detector.onnx');
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
let session: Promise<ort.InferenceSession> | null = null;

/** P(synthetic) in 0..1, or null if no model is installed. */
export async function artifactScore(img: Buffer): Promise<number | null> {
  if (!fs.existsSync(MODEL)) return null;
  session ??= ort.InferenceSession.create(MODEL, { logSeverityLevel: 3 });
  const s = await session;
  const { data } = await sharp(img, { failOn: 'none' }).removeAlpha().resize(224, 224, { fit: 'cover' }).raw().toBuffer({ resolveWithObject: true });
  const px = 224 * 224;
  const input = new Float32Array(3 * px);
  for (let i = 0; i < px; i++) for (let c = 0; c < 3; c++) input[c * px + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, 224, 224]) });
  const v = out[s.outputNames[0]].data as Float32Array;
  if (v.length === 1) return 1 / (1 + Math.exp(-v[0]));
  const e0 = Math.exp(v[0]), e1 = Math.exp(v[1]);
  return e1 / (e0 + e1);
}
