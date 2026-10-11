// Synthetic "re-uploads" of an image, used to MEASURE the engine (and to make real-world test
// inputs: `npm run variants -- my.jpg`). Each variant carries the label the engine SHOULD give.
import sharp from 'sharp';
import { MatchType, FaceBox } from '../types';
import { normalize } from '../util/image';
import { detectLargestFace, faceModelsAvailable } from '../fingerprint/face';

export interface Variant { name: string; expected: MatchType; buffer: Buffer; note?: string }

const clampInt = (v: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, v)));

export async function makeVariants(src: Buffer, donor?: Buffer): Promise<Variant[]> {
  const base = await normalize(src);
  const { width: W = 0, height: H = 0 } = await sharp(base).metadata();
  const out: Variant[] = [];
  const add = async (name: string, expected: MatchType, p: sharp.Sharp, note?: string) =>
    out.push({ name, expected, buffer: await p.jpeg({ quality: 90 }).toBuffer(), note });

  // ---- exact: same picture, different encoding -------------------------------------------
  out.push({ name: 'identity', expected: 'exact', buffer: base });
  out.push({ name: 'recompress_q85', expected: 'exact', buffer: await sharp(base).jpeg({ quality: 85 }).toBuffer() });
  out.push({ name: 'jpeg_q30', expected: 'exact', buffer: await sharp(base).jpeg({ quality: 30 }).toBuffer() });
  await add('resize_50', 'exact', sharp(base).resize(Math.round(W / 2)));

  // ---- near duplicate: same picture, edited ----------------------------------------------
  await add('crop_center_80', 'near_duplicate', sharp(base).extract({ left: Math.round(W * 0.1), top: Math.round(H * 0.1), width: Math.round(W * 0.8), height: Math.round(H * 0.8) }));
  await add('mirror', 'near_duplicate', sharp(base).flop());
  await add('grayscale', 'near_duplicate', sharp(base).greyscale());
  await add('warm_tint', 'near_duplicate', sharp(base).tint({ r: 255, g: 210, b: 160 }));
  await add('bright_desat', 'near_duplicate', sharp(base).modulate({ brightness: 1.3, saturation: 0.7 }));
  await add('white_border', 'near_duplicate', sharp(base).extend({ top: Math.round(H * 0.06), bottom: Math.round(H * 0.06), left: Math.round(W * 0.06), right: Math.round(W * 0.06), background: '#ffffff' }));
  const wm = Buffer.from(`<svg width="${W}" height="${H}"><text x="50%" y="92%" font-size="${Math.round(H / 10)}" text-anchor="middle" fill="white" fill-opacity="0.6" font-family="sans-serif">@someuser</text></svg>`);
  await add('watermark_handle', 'near_duplicate', sharp(base).composite([{ input: wm }]));

  // ---- similar: heavier changes ------------------------------------------------------------
  await add('crop_corner_55', 'similar', sharp(base).extract({ left: 0, top: 0, width: Math.round(W * 0.55), height: Math.round(H * 0.55) }));
  await add('rotate_7deg', 'similar', sharp(base).rotate(7, { background: '#000000' }));

  // ---- possible deepfake: paste ANOTHER face onto this image (needs a donor) ----------------
  if (donor) {
    const swapped = await simulateFaceSwap(base, await normalize(donor));
    out.push({ name: 'faceswap_sim', expected: 'possible_deepfake', buffer: swapped.buffer, note: swapped.note });
  }
  return out;
}

/**
 * Crude face-swap SIMULATION (not a real deepfake): paste the donor's face, through an elliptical
 * mask, over the base image's face. It creates exactly the structure the engine looks for:
 * "same body & background, different face". Real swaps are blended better; use this only as a
 * regression test for the region-scoring logic.
 */
export async function simulateFaceSwap(base: Buffer, donor: Buffer): Promise<{ buffer: Buffer; note: string }> {
  const bm = await sharp(base).metadata();
  const dm = await sharp(donor).metadata();
  const bW = bm.width!, bH = bm.height!, dW = dm.width!, dH = dm.height!;
  let note = 'detected face boxes';
  const heur = (w: number, h: number): FaceBox => ({ x: w * 0.3, y: h * 0.08, w: w * 0.4, h: h * 0.3, score: 0 });

  let bb = faceModelsAvailable() ? await detectLargestFace(base) : null;
  let db = faceModelsAvailable() ? await detectLargestFace(donor) : null;
  if (!bb || !db) { bb = bb ?? heur(bW, bH); db = db ?? heur(dW, dH); note = 'heuristic face boxes (no detector/face found)'; }

  const pw = clampInt(bb.w, 8, bW), ph = clampInt(bb.h, 8, bH);
  const left = clampInt(bb.x, 0, bW - pw), top = clampInt(bb.y, 0, bH - ph);
  const dl = clampInt(db.x, 0, dW - 8), dt = clampInt(db.y, 0, dH - 8);
  const dw = clampInt(db.w, 8, dW - dl), dh = clampInt(db.h, 8, dH - dt);

  const mask = Buffer.from(`<svg width="${pw}" height="${ph}"><ellipse cx="${pw / 2}" cy="${ph / 2}" rx="${pw / 2}" ry="${ph / 2}" fill="white"/></svg>`);
  const patch = await sharp(donor)
    .extract({ left: dl, top: dt, width: dw, height: dh })
    .resize(pw, ph, { fit: 'fill' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  const buffer = await sharp(base).composite([{ input: patch, left, top }]).jpeg({ quality: 92 }).toBuffer();
  return { buffer, note };
}
