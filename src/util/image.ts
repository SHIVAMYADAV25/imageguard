// Image helpers built on sharp. All pixels go through `normalize` first so that the user's
// upload and every candidate are fingerprinted under identical conditions.
import sharp from 'sharp';

const LIMIT = { limitInputPixels: 60_000_000, failOn: 'none' as const };

/**
 * Normalize: apply EXIF rotation, flatten alpha onto white, cap the longest side, re-encode as JPEG.
 * Re-encoding also STRIPS all metadata (EXIF/GPS) because sharp drops it unless asked to keep it.
 */
export async function normalize(buf: Buffer, maxSide = 1024): Promise<Buffer> {
  return sharp(buf, LIMIT)
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function dims(buf: Buffer): Promise<{ width: number; height: number }> {
  const m = await sharp(buf, LIMIT).metadata();
  return { width: m.width ?? 0, height: m.height ?? 0 };
}

/**
 * A privacy-preserving thumbnail: shrink to ~20px, then scale back up with nearest-neighbour.
 * The result is a pixelated block image that cannot be un-blurred, which is what we store for
 * anything that is not clearly "safe".
 */
export async function pixelatedThumb(buf: Buffer): Promise<Buffer> {
  const tiny = await sharp(buf, LIMIT).rotate().resize(20, 20, { fit: 'inside' }).toBuffer();
  return sharp(tiny).resize(160, 160, { fit: 'inside', kernel: 'nearest' }).jpeg({ quality: 60 }).toBuffer();
}

export async function plainThumb(buf: Buffer): Promise<Buffer> {
  return sharp(buf, LIMIT).rotate().resize(240, 240, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
}
