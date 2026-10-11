// Step 7a: NSFW classification with NudeNet v3 (YOLOv8 detector, 320x320) in ONNX.
// Used ONLY to (1) label results and (2) decide whether the stored thumbnail is pixelated.
// It is never used to skip verification and the engine does not generate or store explicit media.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';
import { config } from '../config';
import { NsfwLabel } from '../types';

const MODEL = path.join(config.modelsDir, 'nsfw_nudenet.onnx');
export const nsfwModelAvailable = () => fs.existsSync(MODEL);

// NudeNet v3 class order (model output channels 4..21 are these, in this order).
const LABELS = [
  'FEMALE_GENITALIA_COVERED', 'FACE_FEMALE', 'BUTTOCKS_EXPOSED', 'FEMALE_BREAST_EXPOSED',
  'FEMALE_GENITALIA_EXPOSED', 'MALE_BREAST_EXPOSED', 'ANUS_EXPOSED', 'FEET_EXPOSED', 'BELLY_COVERED',
  'FEET_COVERED', 'ARMPITS_COVERED', 'ARMPITS_EXPOSED', 'FACE_MALE', 'BELLY_EXPOSED',
  'MALE_GENITALIA_EXPOSED', 'ANUS_COVERED', 'FEMALE_BREAST_COVERED', 'BUTTOCKS_COVERED',
];
// Conservative: any exposed intimate region => "explicit" (we would rather over-blur).
const EXPLICIT = ['FEMALE_GENITALIA_EXPOSED', 'MALE_GENITALIA_EXPOSED', 'ANUS_EXPOSED', 'FEMALE_BREAST_EXPOSED', 'BUTTOCKS_EXPOSED'];
const SUGGESTIVE = ['FEMALE_GENITALIA_COVERED', 'BUTTOCKS_COVERED', 'ANUS_COVERED'];

let session: Promise<ort.InferenceSession> | null = null;

export async function classifyNsfw(img: Buffer): Promise<NsfwLabel> {
  if (!nsfwModelAvailable()) return 'unknown';
  session ??= ort.InferenceSession.create(MODEL, { logSeverityLevel: 3 });
  const s = await session;

  // NudeNet pads to a square (bottom/right) then resizes to 320, RGB, /255, CHW.
  const { data } = await sharp(img, { failOn: 'none' })
    .removeAlpha()
    .resize(320, 320, { fit: 'contain', position: 'left top', background: { r: 0, g: 0, b: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = 320 * 320;
  const input = new Float32Array(3 * px);
  for (let i = 0; i < px; i++) for (let c = 0; c < 3; c++) input[c * px + i] = data[i * 3 + c] / 255;

  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, 320, 320]) });
  const t = out[s.outputNames[0]];
  const [, d1, d2] = t.dims as number[];
  const arr = t.data as Float32Array;
  const channelsFirst = d1 === 4 + LABELS.length; // [1, 22, anchors] vs [1, anchors, 22]
  const anchors = channelsFirst ? d2 : d1;

  // Highest score seen for each class over all anchors (we only need "is it present?", no boxes).
  const best = new Array(LABELS.length).fill(0);
  for (let a = 0; a < anchors; a++)
    for (let c = 0; c < LABELS.length; c++) {
      const sc = channelsFirst ? arr[(4 + c) * anchors + a] : arr[a * d2 + 4 + c];
      if (sc > best[c]) best[c] = sc;
    }
  const score = (names: string[]) => Math.max(...names.map((n) => best[LABELS.indexOf(n)]));
  if (score(EXPLICIT) >= config.thresholds.nsfwExplicit) return 'explicit';
  if (score(SUGGESTIVE) >= config.thresholds.nsfwSuggestive) return 'suggestive';
  return 'safe';
}
