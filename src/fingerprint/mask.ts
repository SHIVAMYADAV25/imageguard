// Paint the face region mid-gray so an embedding of the result describes only the body,
// clothing, pose and background. This is the key trick for face-swap detection:
//   face-swapped copy of YOUR photo  -> masked embedding still matches, face embedding does not.
import sharp from 'sharp';
import { FaceBox } from '../types';

export async function maskFace(img: Buffer, box: FaceBox, expand = 1.5): Promise<Buffer> {
  const { width: W = 0, height: H = 0 } = await sharp(img, { failOn: 'none' }).metadata();
  // Expand the box so hair, forehead and ears are hidden too (swaps often blend over them).
  const w = Math.min(W, Math.round(box.w * expand));
  const h = Math.min(H, Math.round(box.h * expand));
  const left = Math.max(0, Math.min(W - w, Math.round(box.x + box.w / 2 - w / 2)));
  const top = Math.max(0, Math.min(H - h, Math.round(box.y + box.h / 2 - h / 2)));
  const patch = { create: { width: w, height: h, channels: 3 as const, background: { r: 128, g: 128, b: 128 } } };
  return sharp(img, { failOn: 'none' }).composite([{ input: patch, left, top }]).jpeg({ quality: 92 }).toBuffer();
}
