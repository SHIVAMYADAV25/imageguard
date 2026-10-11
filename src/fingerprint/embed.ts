// Global image embeddings: the "similar / re-edited" signal. Two pictures of the same scene
// land close together in embedding space even when pixels differ a lot (crops, filters, overlays).
//
// Two implementations behind one interface:
//   * ClipEmbedder     - real CLIP ViT-B/32 via onnxruntime-node (needs models/clip_vision.onnx)
//   * FallbackEmbedder - a 16x16 colour thumbnail. WEAK, only so the pipeline runs without models.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';
import { config } from '../config';
import { l2normalize } from '../util/math';
import { log } from '../util/log';

/** Per-model decision thresholds, because cosine scales differ between models. */
export interface EmbedderCalibration {
  exact: number;     // cosine at/above which (with a close pHash) we call it "exact"
  nearDup: number;   // cosine at/above which we call it "near duplicate"
  similar: number;   // cosine at/above which we call it "similar"
  sameScene: number; // cosine of FACE-MASKED embeddings at/above which body/background is "the same"
}

export interface Embedder {
  name: string;
  calib: EmbedderCalibration;
  embed(img: Buffer): Promise<Float32Array>; // always returns an L2-normalized vector
}

// ---- CLIP -----------------------------------------------------------------------------------
const CLIP_MEAN = [0.48145466, 0.4578275, 0.40821073];
const CLIP_STD = [0.26862954, 0.26130258, 0.27577711];

class ClipEmbedder implements Embedder {
  name = 'clip-vit-b32';
  // Typical image-image cosines for CLIP B/32: recompressed ~0.97+, edited ~0.9, same scene ~0.85.
  // These are starting points: calibrate with `npm run eval`.
  calib: EmbedderCalibration = { exact: 0.97, nearDup: 0.92, similar: 0.84, sameScene: 0.88 };
  constructor(private session: ort.InferenceSession) {}

  async embed(img: Buffer): Promise<Float32Array> {
    // CLIP preprocessing: resize shortest side to 224 + centre crop (= sharp 'cover'), RGB, normalize.
    const { data } = await sharp(img, { failOn: 'none' })
      .removeAlpha()
      .resize(224, 224, { fit: 'cover', kernel: 'cubic' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const px = 224 * 224;
    const input = new Float32Array(3 * px); // CHW layout
    for (let i = 0; i < px; i++)
      for (let c = 0; c < 3; c++) input[c * px + i] = (data[i * 3 + c] / 255 - CLIP_MEAN[c]) / CLIP_STD[c];

    const out = await this.session.run({
      [this.session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, 224, 224]),
    });
    // The Xenova export names the projected embedding "image_embeds"; fall back to the first output.
    const t = out['image_embeds'] ?? out[this.session.outputNames[0]];
    return l2normalize(Float32Array.from(t.data as Float32Array));
  }
}

// ---- Fallback -------------------------------------------------------------------------------
class FallbackEmbedder implements Embedder {
  name = 'fallback-thumb16';
  calib: EmbedderCalibration = { exact: 0.95, nearDup: 0.9, similar: 0.75, sameScene: 0.88 };
  async embed(img: Buffer): Promise<Float32Array> {
    const { data } = await sharp(img, { failOn: 'none' })
      .removeAlpha()
      .resize(16, 16, { fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const v = Float32Array.from(data as Uint8Array);
    // Mean-centre so unrelated images are ~0 apart instead of all being "bright = similar".
    let mean = 0;
    for (const x of v) mean += x;
    mean /= v.length;
    for (let i = 0; i < v.length; i++) v[i] -= mean;
    return l2normalize(v);
  }
}

// ---- Factory (singleton) --------------------------------------------------------------------
let cached: Promise<Embedder> | null = null;

export function getEmbedder(): Promise<Embedder> {
  cached ??= (async () => {
    const p = path.join(config.modelsDir, 'clip_vision.onnx');
    if (fs.existsSync(p)) {
      const session = await ort.InferenceSession.create(p, { logSeverityLevel: 3 });
      log.info('embed', `using CLIP (${p})`);
      return new ClipEmbedder(session);
    }
    log.warn('embed', 'models/clip_vision.onnx not found -> using WEAK fallback embedder. Run: npm run models');
    return new FallbackEmbedder();
  })();
  return cached;
}
